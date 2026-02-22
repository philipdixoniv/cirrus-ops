// supabase/functions/stripe-sync/index.ts
// Syncs the org's product catalog to Stripe (sandbox environment).
// Creates/updates Stripe Products and Prices, handling the Stripe
// immutability constraint on prices (archive old, create new).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BILLING_INTERVALS: Record<string, { interval: string; interval_count: number }> = {
  monthly: { interval: "month", interval_count: 1 },
  quarterly: { interval: "month", interval_count: 3 },
  annual: { interval: "year", interval_count: 1 },
};

/** Helper to make Stripe API calls using plain fetch. */
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

/**
 * Flatten a nested object into Stripe's bracket notation for form-encoded bodies.
 * e.g. { metadata: { org_id: "abc" } } -> { "metadata[org_id]": "abc" }
 */
function flattenParams(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenParams(value as Record<string, unknown>, fullKey));
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
    const { org_id, product_id } = await req.json();
    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "org_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Stripe sandbox integration
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("provider", "stripe")
      .eq("environment", "sandbox")
      .eq("is_active", true)
      .single();

    if (intError || !integration) {
      throw new Error("No active Stripe sandbox integration found");
    }

    const stripeKey = integration.credentials?.api_key || integration.credentials?.secret_key || integration.credentials?.test_secret_key;
    if (!stripeKey) {
      throw new Error("Stripe API key not found in integration credentials");
    }

    // Fetch active products for this org (optionally filtered to a single product)
    let productsQuery = supabase
      .from("products")
      .select("*, product_tiers(*)")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (product_id) {
      productsQuery = productsQuery.eq("id", product_id);
    }

    const { data: products, error: prodError } = await productsQuery.order("sort_order");

    if (prodError) throw prodError;

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
        environment: "sandbox",
        action,
        stripe_id: stripeId,
        request_data: requestData,
        response_data: responseData,
        error,
      });
    };

    const results: Array<{
      product_slug: string;
      stripe_product_id: string;
      prices: Record<string, string>;
    }> = [];

    for (const product of products || []) {
      try {
        // ---- Create or update Stripe Product ----
        let stripeProductId = product.stripe_product_id_sandbox;

        if (stripeProductId) {
          // Update existing product
          const updateParams = flattenParams({
            name: product.name,
            metadata: { cirrus_product_id: product.id, org_id },
          });

          const updated = await stripeRequest("POST", `/products/${stripeProductId}`, stripeKey, updateParams);
          await syncLog("product", product.id, "update", stripeProductId, updateParams, updated, null);
        } else {
          // Create new product
          const createParams = flattenParams({
            name: product.name,
            metadata: { cirrus_product_id: product.id, org_id },
          });

          const created = await stripeRequest("POST", "/products", stripeKey, createParams);
          stripeProductId = created.id as string;

          await supabase
            .from("products")
            .update({
              stripe_product_id_sandbox: stripeProductId,
              stripe_synced_at: new Date().toISOString(),
              stripe_sync_status: "synced",
            })
            .eq("id", product.id);

          await syncLog("product", product.id, "create", stripeProductId, createParams, created, null);
        }

        // ---- Create prices for each billing interval ----
        const priceResults: Record<string, string> = {};

        if (product.type === "one_time") {
          // One-time products get a single one-time price
          const priceAmountCents = Math.round((product.price || 0) * 100);

          // Check if we already have a price for this product
          const { data: existingPriceMap } = await supabase
            .from("stripe_price_map")
            .select("*")
            .eq("org_id", org_id)
            .eq("product_id", product.id)
            .eq("environment", "sandbox")
            .eq("billing_interval", "monthly") // Use 'monthly' as placeholder for one-time
            .eq("is_active", true)
            .maybeSingle();

          if (existingPriceMap?.stripe_price_id) {
            // Stripe prices are immutable. If amount changed, archive old and create new.
            // For simplicity, we always create a new price and archive the old one.
            try {
              await stripeRequest("POST", `/prices/${existingPriceMap.stripe_price_id}`, stripeKey, {
                active: "false",
              });
            } catch {
              // Price may already be archived
            }

            await supabase
              .from("stripe_price_map")
              .update({ is_active: false })
              .eq("id", existingPriceMap.id);
          }

          const priceParams = flattenParams({
            product: stripeProductId,
            unit_amount: String(priceAmountCents),
            currency: "usd",
            metadata: { cirrus_product_id: product.id, org_id },
          });

          const priceCreated = await stripeRequest("POST", "/prices", stripeKey, priceParams);
          const stripePriceId = priceCreated.id as string;

          await supabase.from("stripe_price_map").insert({
            org_id,
            product_id: product.id,
            environment: "sandbox",
            billing_interval: "monthly",
            stripe_price_id: stripePriceId,
            is_active: true,
          });

          await syncLog("price", product.id, "create", stripePriceId, priceParams, priceCreated, null);
          priceResults["one_time"] = stripePriceId;
        } else {
          // Recurring products: create a price for each billing interval
          for (const [intervalKey, intervalConfig] of Object.entries(BILLING_INTERVALS)) {
            const priceAmountCents = Math.round((product.monthly_price || 0) * 100);

            // Check existing price
            const { data: existingPriceMap } = await supabase
              .from("stripe_price_map")
              .select("*")
              .eq("org_id", org_id)
              .eq("product_id", product.id)
              .eq("environment", "sandbox")
              .eq("billing_interval", intervalKey)
              .eq("is_active", true)
              .maybeSingle();

            if (existingPriceMap?.stripe_price_id) {
              // Archive old price (prices are immutable in Stripe)
              try {
                await stripeRequest("POST", `/prices/${existingPriceMap.stripe_price_id}`, stripeKey, {
                  active: "false",
                });
              } catch {
                // May already be archived
              }

              await supabase
                .from("stripe_price_map")
                .update({ is_active: false })
                .eq("id", existingPriceMap.id);
            }

            const priceParams = flattenParams({
              product: stripeProductId,
              unit_amount: String(priceAmountCents),
              currency: "usd",
              recurring: {
                interval: intervalConfig.interval,
                interval_count: String(intervalConfig.interval_count),
              },
              metadata: {
                cirrus_product_id: product.id,
                org_id,
                billing_interval: intervalKey,
              },
            });

            const priceCreated = await stripeRequest("POST", "/prices", stripeKey, priceParams);
            const stripePriceId = priceCreated.id as string;

            await supabase.from("stripe_price_map").insert({
              org_id,
              product_id: product.id,
              environment: "sandbox",
              billing_interval: intervalKey,
              stripe_price_id: stripePriceId,
              is_active: true,
            });

            await syncLog("price", product.id, "create", stripePriceId, priceParams, priceCreated, null);
            priceResults[intervalKey] = stripePriceId;
          }
        }

        results.push({
          product_slug: product.slug,
          stripe_product_id: stripeProductId!,
          prices: priceResults,
        });
      } catch (err) {
        await syncLog("product", product.id, "error", null, null, null, String(err));
        results.push({
          product_slug: product.slug,
          stripe_product_id: product.stripe_product_id_sandbox || "ERROR",
          prices: { error: String(err) },
        });
      }
    }

    // Update integration last_sync_at
    await supabase
      .from("integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integration.id);

    return new Response(
      JSON.stringify({ synced_products: results.length, products: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Stripe sync failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
