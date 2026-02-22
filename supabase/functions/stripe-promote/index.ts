// supabase/functions/stripe-promote/index.ts
// Promotes sandbox Stripe products/prices to production.
// Reads sandbox product catalog and replicates everything
// to the production Stripe account.

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
    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "org_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch production Stripe integration
    const { data: prodIntegration, error: prodIntError } = await supabase
      .from("integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("provider", "stripe")
      .eq("environment", "production")
      .eq("is_active", true)
      .single();

    if (prodIntError || !prodIntegration) {
      throw new Error(
        "No active Stripe production integration found. Add a live Stripe key first."
      );
    }

    const liveKey =
      prodIntegration.credentials?.api_key ||
      prodIntegration.credentials?.secret_key ||
      prodIntegration.credentials?.live_secret_key;
    if (!liveKey) {
      throw new Error("Live Stripe API key not found in production integration credentials");
    }

    // Fetch all active products that have been synced to sandbox
    const { data: products, error: prodError } = await supabase
      .from("products")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .not("stripe_product_id_sandbox", "is", null)
      .order("sort_order");

    if (prodError) throw prodError;

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "No sandbox-synced products found. Run stripe-sync first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      product_slug: string;
      stripe_product_id_prod: string;
      prices: Record<string, string>;
    }> = [];

    for (const product of products) {
      try {
        // Mark product as promoting
        await supabase
          .from("products")
          .update({ stripe_promotion_status: "promoting" })
          .eq("id", product.id);

        // ---- Create or update production Stripe Product ----
        let prodStripeProductId = product.stripe_product_id_prod;

        if (prodStripeProductId) {
          // Update existing production product
          const updateParams = flattenParams({
            name: product.name,
            metadata: { cirrus_product_id: product.id, org_id },
          });

          await stripeRequest("POST", `/products/${prodStripeProductId}`, liveKey, updateParams);

          await supabase.from("stripe_sync_log").insert({
            org_id,
            entity_type: "product",
            entity_id: product.id,
            environment: "production",
            action: "update",
            stripe_id: prodStripeProductId,
          });
        } else {
          // Create new production product
          const createParams = flattenParams({
            name: product.name,
            metadata: { cirrus_product_id: product.id, org_id },
          });

          const created = await stripeRequest("POST", "/products", liveKey, createParams);
          prodStripeProductId = created.id as string;

          await supabase
            .from("products")
            .update({ stripe_product_id_prod: prodStripeProductId })
            .eq("id", product.id);

          await supabase.from("stripe_sync_log").insert({
            org_id,
            entity_type: "product",
            entity_id: product.id,
            environment: "production",
            action: "create",
            stripe_id: prodStripeProductId,
          });
        }

        // ---- Replicate prices from sandbox price map ----
        const { data: sandboxPrices } = await supabase
          .from("stripe_price_map")
          .select("*")
          .eq("org_id", org_id)
          .eq("product_id", product.id)
          .eq("environment", "sandbox")
          .eq("is_active", true);

        const priceResults: Record<string, string> = {};

        for (const sbPrice of sandboxPrices || []) {
          // Check if we already have a production price for this interval
          const { data: existingProdPrice } = await supabase
            .from("stripe_price_map")
            .select("*")
            .eq("org_id", org_id)
            .eq("product_id", product.id)
            .eq("environment", "production")
            .eq("billing_interval", sbPrice.billing_interval)
            .eq("is_active", true)
            .maybeSingle();

          // Archive old production price if it exists
          if (existingProdPrice?.stripe_price_id) {
            try {
              await stripeRequest("POST", `/prices/${existingProdPrice.stripe_price_id}`, liveKey, {
                active: "false",
              });
            } catch {
              // May already be archived
            }

            await supabase
              .from("stripe_price_map")
              .update({ is_active: false })
              .eq("id", existingProdPrice.id);
          }

          // Retrieve the sandbox price details from Stripe to copy them
          const sandboxIntegration = await supabase
            .from("integrations")
            .select("credentials")
            .eq("org_id", org_id)
            .eq("provider", "stripe")
            .eq("environment", "sandbox")
            .single();

          const sandboxKey =
            sandboxIntegration.data?.credentials?.api_key ||
            sandboxIntegration.data?.credentials?.secret_key ||
            sandboxIntegration.data?.credentials?.test_secret_key;

          let priceData: Record<string, unknown>;
          try {
            priceData = await stripeRequest("GET", `/prices/${sbPrice.stripe_price_id}`, sandboxKey);
          } catch {
            // If we can't read sandbox price, reconstruct from our DB
            priceData = {};
          }

          // Build production price params
          const priceParams: Record<string, unknown> = {
            product: prodStripeProductId!,
            currency: (priceData.currency as string) || "usd",
            metadata: {
              cirrus_product_id: product.id,
              org_id,
              billing_interval: sbPrice.billing_interval,
            },
          };

          if (priceData.unit_amount !== undefined) {
            priceParams.unit_amount = String(priceData.unit_amount);
          } else {
            // Fallback: compute from product table
            const amount = product.type === "one_time"
              ? Math.round((product.price || 0) * 100)
              : Math.round((product.monthly_price || 0) * 100);
            priceParams.unit_amount = String(amount);
          }

          if (priceData.recurring) {
            const recurring = priceData.recurring as Record<string, unknown>;
            priceParams.recurring = {
              interval: recurring.interval,
              interval_count: String(recurring.interval_count || 1),
            };
          } else if (product.type !== "one_time") {
            // Reconstruct recurring from billing_interval
            const intervalMap: Record<string, { interval: string; interval_count: string }> = {
              monthly: { interval: "month", interval_count: "1" },
              quarterly: { interval: "month", interval_count: "3" },
              annual: { interval: "year", interval_count: "1" },
            };
            const mapped = intervalMap[sbPrice.billing_interval];
            if (mapped) {
              priceParams.recurring = mapped;
            }
          }

          const newProdPrice = await stripeRequest(
            "POST",
            "/prices",
            liveKey,
            flattenParams(priceParams)
          );
          const prodPriceId = newProdPrice.id as string;

          await supabase.from("stripe_price_map").insert({
            org_id,
            product_id: product.id,
            environment: "production",
            billing_interval: sbPrice.billing_interval,
            stripe_price_id: prodPriceId,
            is_active: true,
          });

          await supabase.from("stripe_sync_log").insert({
            org_id,
            entity_type: "price",
            entity_id: product.id,
            environment: "production",
            action: "create",
            stripe_id: prodPriceId,
          });

          priceResults[sbPrice.billing_interval] = prodPriceId;
        }

        // Update product promotion status
        await supabase
          .from("products")
          .update({
            stripe_promoted_at: new Date().toISOString(),
            stripe_promotion_status: "promoted",
          })
          .eq("id", product.id);

        results.push({
          product_slug: product.slug,
          stripe_product_id_prod: prodStripeProductId!,
          prices: priceResults,
        });
      } catch (err) {
        await supabase
          .from("products")
          .update({ stripe_promotion_status: "failed" })
          .eq("id", product.id);

        await supabase.from("stripe_sync_log").insert({
          org_id,
          entity_type: "product",
          entity_id: product.id,
          environment: "production",
          action: "promote_error",
          error: String(err),
        });

        results.push({
          product_slug: product.slug,
          stripe_product_id_prod: "ERROR",
          prices: { error: String(err) },
        });
      }
    }

    return new Response(
      JSON.stringify({ promoted_products: results.length, products: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Promotion failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
