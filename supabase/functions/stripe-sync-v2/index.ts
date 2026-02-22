// supabase/functions/stripe-sync-v2/index.ts
// Pushes local changes from stripe_products + stripe_prices to the Stripe API.
// Reads from the Stripe-native tables (not the old products table).
// Handles Stripe price immutability: archive old price, create new, update stripe_id.
// Accepts stripe_instance_id to look up credentials from stripe_instances table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function stripeRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = `https://api.stripe.com/v1${path}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  if (body) {
    options.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed: ${JSON.stringify(data)}`);
  }

  return data as Record<string, unknown>;
}

function flattenParams(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          Object.assign(
            result,
            flattenParams(item as Record<string, unknown>, `${fullKey}[${index}]`)
          );
        } else {
          result[`${fullKey}[${index}]`] = String(item);
        }
      });
    } else if (
      value !== null &&
      value !== undefined &&
      typeof value === "object"
    ) {
      Object.assign(
        result,
        flattenParams(value as Record<string, unknown>, fullKey)
      );
    } else if (value !== null && value !== undefined) {
      result[fullKey] = String(value);
    }
  }

  return result;
}

/** Check if a stripe_id is a local placeholder (not yet pushed to Stripe). */
function isLocalId(stripeId: string): boolean {
  return stripeId.startsWith("local_");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, stripe_instance_id, product_id } = await req.json();
    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "org_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!stripe_instance_id) {
      return new Response(
        JSON.stringify({ error: "stripe_instance_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch Stripe instance
    const { data: instance, error: instError } = await supabase
      .from("stripe_instances")
      .select("*")
      .eq("id", stripe_instance_id)
      .eq("org_id", org_id)
      .eq("is_active", true)
      .single();

    if (instError || !instance) {
      throw new Error("No active Stripe instance found");
    }

    const stripeKey =
      instance.credentials?.api_key ||
      instance.credentials?.secret_key;

    if (!stripeKey) {
      throw new Error("Stripe API key not found in instance credentials");
    }

    const now = new Date().toISOString();

    // Map instance name to valid environment for sync_log CHECK constraint
    const nameLower = (instance.name || "").toLowerCase();
    const logEnvironment = nameLower.includes("prod") || nameLower.includes("live")
      ? "production"
      : "sandbox";

    const syncLog = async (
      entityType: string,
      entityId: string,
      action: string,
      stripeId: string | null,
      requestData: unknown,
      responseData: unknown,
      error: string | null
    ) => {
      await supabase.from("stripe_sync_log").insert({
        org_id,
        entity_type: entityType,
        entity_id: entityId,
        environment: logEnvironment,
        action,
        stripe_id: stripeId,
        request_data: requestData,
        response_data: responseData,
        error,
      });
    };

    // Fetch products to sync
    let productsQuery = supabase
      .from("stripe_products")
      .select("*")
      .eq("org_id", org_id)
      .eq("stripe_instance_id", stripe_instance_id)
      .eq("active", true);

    if (product_id) {
      productsQuery = productsQuery.eq("id", product_id);
    }

    const { data: products, error: prodError } = await productsQuery.order("name");
    if (prodError) throw prodError;

    const results: Array<{
      product_name: string;
      stripe_product_id: string;
      action: string;
      prices_synced: number;
    }> = [];

    for (const product of products || []) {
      try {
        let stripeProductId = product.stripe_id;

        if (isLocalId(stripeProductId)) {
          // ---- Create new product in Stripe ----
          const createParams = flattenParams({
            name: product.name,
            ...(product.description ? { description: product.description } : {}),
            ...(product.unit_label ? { unit_label: product.unit_label } : {}),
            ...(product.url ? { url: product.url } : {}),
            ...(product.statement_descriptor
              ? { statement_descriptor: product.statement_descriptor }
              : {}),
            metadata: {
              ...(product.metadata || {}),
              cirrus_org_id: org_id,
              cirrus_native_id: product.id,
            },
          });

          const created = await stripeRequest(
            "POST",
            "/products",
            stripeKey,
            createParams
          );
          stripeProductId = created.id as string;

          // Update local record with real Stripe ID
          await supabase
            .from("stripe_products")
            .update({
              stripe_id: stripeProductId,
              stripe_created: created.created as number,
              stripe_updated: created.updated as number,
              synced_at: now,
            })
            .eq("id", product.id);

          await syncLog(
            "product_v2",
            product.id,
            "create",
            stripeProductId,
            createParams,
            created,
            null
          );
        } else {
          // ---- Update existing product in Stripe ----
          const updateParams = flattenParams({
            name: product.name,
            ...(product.description !== null
              ? { description: product.description }
              : {}),
            ...(product.unit_label ? { unit_label: product.unit_label } : {}),
            active: String(product.active),
            metadata: {
              ...(product.metadata || {}),
              cirrus_org_id: org_id,
              cirrus_native_id: product.id,
            },
          });

          const updated = await stripeRequest(
            "POST",
            `/products/${stripeProductId}`,
            stripeKey,
            updateParams
          );

          await supabase
            .from("stripe_products")
            .update({
              stripe_updated: updated.updated as number,
              synced_at: now,
            })
            .eq("id", product.id);

          await syncLog(
            "product_v2",
            product.id,
            "update",
            stripeProductId,
            updateParams,
            updated,
            null
          );
        }

        // ---- Sync prices for this product ----
        const { data: localPrices } = await supabase
          .from("stripe_prices")
          .select("*")
          .eq("org_id", org_id)
          .eq("stripe_instance_id", stripe_instance_id)
          .eq("product_stripe_id", product.stripe_id)
          .eq("active", true);

        // Also fetch prices linked to the new stripe_id if it changed
        let allPrices = localPrices || [];
        if (stripeProductId !== product.stripe_id) {
          const { data: movedPrices } = await supabase
            .from("stripe_prices")
            .select("*")
            .eq("org_id", org_id)
            .eq("stripe_instance_id", stripe_instance_id)
            .eq("product_stripe_id", stripeProductId)
            .eq("active", true);
          allPrices = [...allPrices, ...(movedPrices || [])];

          // Update prices to point to the new product stripe_id
          if (localPrices && localPrices.length > 0) {
            await supabase
              .from("stripe_prices")
              .update({ product_stripe_id: stripeProductId })
              .eq("org_id", org_id)
              .eq("stripe_instance_id", stripe_instance_id)
              .eq("product_stripe_id", product.stripe_id);
          }
        }

        let pricesSynced = 0;

        for (const price of allPrices) {
          try {
            if (isLocalId(price.stripe_id)) {
              // ---- Create new price in Stripe ----
              const priceParams: Record<string, unknown> = {
                product: stripeProductId,
                currency: price.currency || "usd",
                metadata: {
                  ...(price.metadata || {}),
                  cirrus_org_id: org_id,
                  cirrus_native_id: price.id,
                },
              };

              if (price.billing_scheme === "tiered" && price.tiers) {
                priceParams.billing_scheme = "tiered";
                priceParams.tiers_mode = price.tiers_mode || "volume";
                priceParams.tiers = price.tiers;
              } else {
                priceParams.unit_amount = String(price.unit_amount || 0);
              }

              if (price.type === "recurring") {
                priceParams.recurring = {
                  interval: price.recurring_interval,
                  interval_count: String(
                    price.recurring_interval_count || 1
                  ),
                  ...(price.recurring_usage_type
                    ? { usage_type: price.recurring_usage_type }
                    : {}),
                };
              }

              if (price.tax_behavior) {
                priceParams.tax_behavior = price.tax_behavior;
              }

              const created = await stripeRequest(
                "POST",
                "/prices",
                stripeKey,
                flattenParams(priceParams)
              );
              const newPriceId = created.id as string;

              await supabase
                .from("stripe_prices")
                .update({
                  stripe_id: newPriceId,
                  stripe_created: created.created as number,
                  synced_at: now,
                })
                .eq("id", price.id);

              await syncLog(
                "price_v2",
                price.id,
                "create",
                newPriceId,
                priceParams,
                created,
                null
              );
              pricesSynced++;
            }
            // Existing Stripe prices are immutable — no update needed.
          } catch (priceErr) {
            await syncLog(
              "price_v2",
              price.id,
              "error",
              price.stripe_id,
              null,
              null,
              String(priceErr)
            );
          }
        }

        results.push({
          product_name: product.name,
          stripe_product_id: stripeProductId,
          action: isLocalId(product.stripe_id) ? "created" : "updated",
          prices_synced: pricesSynced,
        });
      } catch (prodErr) {
        await syncLog(
          "product_v2",
          product.id,
          "error",
          product.stripe_id,
          null,
          null,
          String(prodErr)
        );
        results.push({
          product_name: product.name,
          stripe_product_id: product.stripe_id || "ERROR",
          action: "error",
          prices_synced: 0,
        });
      }
    }

    // Update instance last_sync_at
    await supabase
      .from("stripe_instances")
      .update({ last_sync_at: now })
      .eq("id", stripe_instance_id);

    return new Response(
      JSON.stringify({
        synced_products: results.length,
        products: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Stripe sync v2 failed",
        details: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
