// supabase/functions/stripe-push-to-instance/index.ts
// Cross-instance product push: creates products and their prices in a target Stripe account,
// inserts corresponding rows in stripe_products/stripe_prices, and records lineage.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const {
      org_id,
      source_instance_id,
      target_instance_id,
      entity_type,
      source_stripe_ids,
    } = await req.json();

    if (!org_id || !source_instance_id || !target_instance_id || !source_stripe_ids) {
      return new Response(
        JSON.stringify({
          error: "org_id, source_instance_id, target_instance_id, and source_stripe_ids are required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (source_instance_id === target_instance_id) {
      return new Response(
        JSON.stringify({ error: "Source and target instances must be different" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch target instance credentials
    const { data: targetInstance, error: targetError } = await supabase
      .from("stripe_instances")
      .select("*")
      .eq("id", target_instance_id)
      .eq("org_id", org_id)
      .eq("is_active", true)
      .single();

    if (targetError || !targetInstance) {
      throw new Error("Target Stripe instance not found or inactive");
    }

    const targetKey =
      targetInstance.credentials?.api_key ||
      targetInstance.credentials?.secret_key;

    if (!targetKey) {
      throw new Error("Target instance has no Stripe API key");
    }

    // Get the caller's user ID for lineage tracking
    const authHeader = req.headers.get("Authorization");
    let pushedBy: string | null = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      pushedBy = user?.id || null;
    }

    const now = new Date().toISOString();
    const results: Array<{
      source_stripe_id: string;
      target_stripe_id: string;
      status: string;
      prices_pushed: number;
    }> = [];

    for (const sourceStripeId of source_stripe_ids) {
      try {
        // Read source product
        const { data: sourceProduct, error: spError } = await supabase
          .from("stripe_products")
          .select("*")
          .eq("org_id", org_id)
          .eq("stripe_instance_id", source_instance_id)
          .eq("stripe_id", sourceStripeId)
          .single();

        if (spError || !sourceProduct) {
          results.push({
            source_stripe_id: sourceStripeId,
            target_stripe_id: "",
            status: "error: source product not found",
            prices_pushed: 0,
          });
          continue;
        }

        // Check if already pushed (lineage exists)
        const { data: existingLineage } = await supabase
          .from("stripe_sync_lineage")
          .select("target_stripe_id")
          .eq("org_id", org_id)
          .eq("entity_type", "product")
          .eq("source_instance_id", source_instance_id)
          .eq("source_stripe_id", sourceStripeId)
          .eq("target_instance_id", target_instance_id)
          .single();

        if (existingLineage) {
          results.push({
            source_stripe_id: sourceStripeId,
            target_stripe_id: existingLineage.target_stripe_id,
            status: "already_pushed",
            prices_pushed: 0,
          });
          continue;
        }

        // Create product in target Stripe account
        const createParams = flattenParams({
          name: sourceProduct.name,
          ...(sourceProduct.description ? { description: sourceProduct.description } : {}),
          ...(sourceProduct.unit_label ? { unit_label: sourceProduct.unit_label } : {}),
          ...(sourceProduct.url ? { url: sourceProduct.url } : {}),
          ...(sourceProduct.statement_descriptor
            ? { statement_descriptor: sourceProduct.statement_descriptor }
            : {}),
          metadata: {
            ...(sourceProduct.metadata || {}),
            cirrus_org_id: org_id,
            cirrus_source_instance: source_instance_id,
            cirrus_source_stripe_id: sourceStripeId,
          },
        });

        const created = await stripeRequest("POST", "/products", targetKey, createParams);
        const targetProductStripeId = created.id as string;

        // Insert into stripe_products for target instance
        await supabase.from("stripe_products").insert({
          org_id,
          stripe_instance_id: target_instance_id,
          stripe_id: targetProductStripeId,
          active: sourceProduct.active,
          name: sourceProduct.name,
          description: sourceProduct.description,
          default_price: null,
          images: sourceProduct.images || [],
          metadata: sourceProduct.metadata || {},
          unit_label: sourceProduct.unit_label,
          tax_code: sourceProduct.tax_code,
          statement_descriptor: sourceProduct.statement_descriptor,
          url: sourceProduct.url,
          marketing_features: sourceProduct.marketing_features || [],
          livemode: (created.livemode as boolean) || false,
          stripe_created: created.created as number,
          stripe_updated: created.updated as number,
          synced_at: now,
        });

        // Record product lineage
        await supabase.from("stripe_sync_lineage").insert({
          org_id,
          entity_type: "product",
          source_instance_id,
          source_stripe_id: sourceStripeId,
          target_instance_id,
          target_stripe_id: targetProductStripeId,
          pushed_by: pushedBy,
        });

        // Push prices for this product
        const { data: sourcePrices } = await supabase
          .from("stripe_prices")
          .select("*")
          .eq("org_id", org_id)
          .eq("stripe_instance_id", source_instance_id)
          .eq("product_stripe_id", sourceStripeId)
          .eq("active", true);

        let pricesPushed = 0;

        for (const sourcePrice of sourcePrices || []) {
          try {
            const priceParams: Record<string, unknown> = {
              product: targetProductStripeId,
              currency: sourcePrice.currency || "usd",
              metadata: {
                ...(sourcePrice.metadata || {}),
                cirrus_org_id: org_id,
                cirrus_source_price_id: sourcePrice.stripe_id,
              },
            };

            if (sourcePrice.billing_scheme === "tiered" && sourcePrice.tiers) {
              priceParams.billing_scheme = "tiered";
              priceParams.tiers_mode = sourcePrice.tiers_mode || "volume";
              priceParams.tiers = sourcePrice.tiers;
            } else {
              priceParams.unit_amount = String(sourcePrice.unit_amount || 0);
            }

            if (sourcePrice.type === "recurring") {
              priceParams.recurring = {
                interval: sourcePrice.recurring_interval,
                interval_count: String(sourcePrice.recurring_interval_count || 1),
                ...(sourcePrice.recurring_usage_type
                  ? { usage_type: sourcePrice.recurring_usage_type }
                  : {}),
              };
            }

            if (sourcePrice.tax_behavior) {
              priceParams.tax_behavior = sourcePrice.tax_behavior;
            }

            if (sourcePrice.nickname) {
              priceParams.nickname = sourcePrice.nickname;
            }

            if (sourcePrice.lookup_key) {
              priceParams.lookup_key = sourcePrice.lookup_key;
            }

            const createdPrice = await stripeRequest(
              "POST",
              "/prices",
              targetKey,
              flattenParams(priceParams)
            );
            const targetPriceStripeId = createdPrice.id as string;

            // Insert into stripe_prices for target instance
            await supabase.from("stripe_prices").insert({
              org_id,
              stripe_instance_id: target_instance_id,
              stripe_id: targetPriceStripeId,
              product_stripe_id: targetProductStripeId,
              active: sourcePrice.active,
              currency: sourcePrice.currency,
              unit_amount: sourcePrice.unit_amount,
              unit_amount_decimal: sourcePrice.unit_amount_decimal,
              billing_scheme: sourcePrice.billing_scheme,
              type: sourcePrice.type,
              recurring_interval: sourcePrice.recurring_interval,
              recurring_interval_count: sourcePrice.recurring_interval_count,
              recurring_usage_type: sourcePrice.recurring_usage_type,
              recurring_meter: sourcePrice.recurring_meter,
              tiers: sourcePrice.tiers,
              tiers_mode: sourcePrice.tiers_mode,
              transform_quantity: sourcePrice.transform_quantity,
              lookup_key: sourcePrice.lookup_key,
              nickname: sourcePrice.nickname,
              metadata: sourcePrice.metadata || {},
              tax_behavior: sourcePrice.tax_behavior,
              custom_unit_amount: sourcePrice.custom_unit_amount,
              livemode: (createdPrice.livemode as boolean) || false,
              stripe_created: createdPrice.created as number,
              synced_at: now,
            });

            // Record price lineage
            await supabase.from("stripe_sync_lineage").insert({
              org_id,
              entity_type: "price",
              source_instance_id,
              source_stripe_id: sourcePrice.stripe_id,
              target_instance_id,
              target_stripe_id: targetPriceStripeId,
              pushed_by: pushedBy,
            });

            pricesPushed++;
          } catch (priceErr) {
            console.error(`Failed to push price ${sourcePrice.stripe_id}:`, priceErr);
          }
        }

        results.push({
          source_stripe_id: sourceStripeId,
          target_stripe_id: targetProductStripeId,
          status: "pushed",
          prices_pushed: pricesPushed,
        });
      } catch (productErr) {
        results.push({
          source_stripe_id: sourceStripeId,
          target_stripe_id: "",
          status: `error: ${String(productErr)}`,
          prices_pushed: 0,
        });
      }
    }

    return new Response(
      JSON.stringify({
        pushed_products: results.filter((r) => r.status === "pushed").length,
        skipped: results.filter((r) => r.status === "already_pushed").length,
        errors: results.filter((r) => r.status.startsWith("error")).length,
        details: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Cross-instance push failed",
        details: String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
