// supabase/functions/stripe-import/index.ts
// Imports products and prices FROM Stripe sandbox INTO the Cirrus DB.
// Maps Stripe product structure to DB schema, matches by stripe_product_id or metadata.product_key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function stripeGet(
  path: string,
  apiKey: string
): Promise<Record<string, unknown>> {
  const url = `https://api.stripe.com/v1${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe GET ${path} failed: ${JSON.stringify(data)}`);
  }
  return data as Record<string, unknown>;
}

interface StripePrice {
  id: string;
  product: string | { id: string };
  unit_amount: number | null;
  currency: string;
  active: boolean;
  billing_scheme: string;
  tiers_mode: string | null;
  recurring: { interval: string; interval_count: number } | null;
  metadata: Record<string, string>;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: Record<string, string>;
}

/** Determine product type from its prices */
function inferProductType(prices: StripePrice[]): string {
  if (prices.some((p) => p.tiers_mode)) return "tiered";
  if (prices.every((p) => !p.recurring)) return "one_time";
  return "per_seat";
}

/** Map Stripe interval to our billing_interval key */
function toBillingInterval(rec: { interval: string; interval_count: number } | null): string {
  if (!rec) return "monthly"; // one-time placeholder
  if (rec.interval === "year") return "annual";
  if (rec.interval === "month" && rec.interval_count === 3) return "quarterly";
  if (rec.interval === "month" && rec.interval_count === 6) return "semiannual";
  return "monthly";
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

    const stripeKey =
      integration.credentials?.api_key ||
      integration.credentials?.secret_key ||
      integration.credentials?.test_secret_key;

    if (!stripeKey) {
      throw new Error("Stripe API key not found in integration credentials");
    }

    // Fetch ALL prices from Stripe (expanded with product)
    const allPrices: StripePrice[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params = new URLSearchParams({
        limit: "100",
        "expand[]": "data.product",
      });
      if (startingAfter) params.set("starting_after", startingAfter);

      const res = await stripeGet(`/prices?${params.toString()}`, stripeKey);
      const data = res.data as StripePrice[];
      allPrices.push(...data);
      hasMore = res.has_more as boolean;
      if (data.length > 0) {
        startingAfter = data[data.length - 1].id;
      }
    }

    // Group prices by product
    const productMap = new Map<string, { product: StripeProduct; prices: StripePrice[] }>();
    for (const price of allPrices) {
      const prod = (typeof price.product === "string" ? null : price.product) as StripeProduct | null;
      if (!prod) continue;

      if (!productMap.has(prod.id)) {
        productMap.set(prod.id, { product: prod, prices: [] });
      }
      productMap.get(prod.id)!.prices.push({
        ...price,
        product: prod.id, // normalize to string
      });
    }

    // Fetch existing products in DB for matching
    const { data: existingProducts } = await supabase
      .from("products")
      .select("*")
      .eq("org_id", org_id);

    const existingByStripeId = new Map<string, Record<string, unknown>>();
    const existingBySlug = new Map<string, Record<string, unknown>>();
    for (const p of existingProducts || []) {
      if (p.stripe_product_id_sandbox) {
        existingByStripeId.set(p.stripe_product_id_sandbox, p);
      }
      if (p.slug) {
        existingBySlug.set(p.slug, p);
      }
    }

    const results: Array<{ name: string; action: string; product_id: string; prices_imported: number }> = [];
    let sortOrder = (existingProducts || []).length;

    for (const [stripeProductId, { product: stripeProd, prices }] of productMap) {
      const productKey = stripeProd.metadata?.product_key || "";
      const slug = productKey || stripeProd.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const productType = inferProductType(prices);

      // Find the monthly price for per_seat products
      const monthlyPrice = prices.find(
        (p) => p.recurring?.interval === "month" && p.recurring?.interval_count === 1
      );
      const annualPrice = prices.find(
        (p) => p.recurring?.interval === "year" && p.recurring?.interval_count === 1
      );
      const oneTimePrice = prices.find((p) => !p.recurring);

      const priceAmount =
        monthlyPrice?.unit_amount ?? annualPrice?.unit_amount ?? oneTimePrice?.unit_amount ?? 0;
      const monthlyAmount = monthlyPrice?.unit_amount
        ? monthlyPrice.unit_amount / 100
        : annualPrice?.unit_amount
        ? annualPrice.unit_amount / 100 / 12
        : 0;

      // Match to existing DB product
      let existing = existingByStripeId.get(stripeProductId) || existingBySlug.get(slug);
      let action: string;
      let dbProductId: string;

      const productData: Record<string, unknown> = {
        name: stripeProd.name,
        slug,
        type: productType,
        description: stripeProd.description || null,
        stripe_product_id_sandbox: stripeProductId,
        stripe_synced_at: new Date().toISOString(),
        stripe_sync_status: "synced",
        stripe_metadata: stripeProd.metadata || {},
        is_active: stripeProd.active,
      };

      if (productType === "per_seat") {
        productData.monthly_price = monthlyAmount;
        productData.unit_label = "Active User";
      } else if (productType === "one_time") {
        productData.price = priceAmount / 100;
      } else if (productType === "tiered") {
        productData.unit_label = "hours";
      }

      if (existing) {
        // Update existing
        action = "updated";
        dbProductId = existing.id as string;
        await supabase
          .from("products")
          .update(productData)
          .eq("id", dbProductId);
      } else {
        // Insert new
        action = "created";
        sortOrder++;
        const { data: inserted, error: insertError } = await supabase
          .from("products")
          .insert({ ...productData, org_id, sort_order: sortOrder })
          .select("id")
          .single();
        if (insertError) throw insertError;
        dbProductId = inserted.id;
      }

      // Import prices into stripe_price_map
      let pricesImported = 0;
      for (const price of prices) {
        if (!price.active) continue;

        const billingInterval = toBillingInterval(price.recurring);

        // Deactivate existing price mapping for this interval
        await supabase
          .from("stripe_price_map")
          .update({ is_active: false })
          .eq("org_id", org_id)
          .eq("product_id", dbProductId)
          .eq("environment", "sandbox")
          .eq("billing_interval", billingInterval)
          .eq("is_active", true);

        // Insert new mapping
        const { error: pmError } = await supabase.from("stripe_price_map").insert({
          org_id,
          product_id: dbProductId,
          environment: "sandbox",
          billing_interval: billingInterval,
          stripe_price_id: price.id,
          is_active: true,
        });

        if (!pmError) pricesImported++;
      }

      // Log the import
      await supabase.from("stripe_sync_log").insert({
        org_id,
        entity_type: "product",
        entity_id: dbProductId,
        environment: "sandbox",
        action: `import_${action}`,
        stripe_id: stripeProductId,
        request_data: { stripe_product: stripeProd },
        response_data: { prices_imported: pricesImported },
      });

      results.push({
        name: stripeProd.name,
        action,
        product_id: dbProductId,
        prices_imported: pricesImported,
      });
    }

    // Update integration last_sync_at
    await supabase
      .from("integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integration.id);

    return new Response(
      JSON.stringify({
        imported_products: results.length,
        total_prices: allPrices.length,
        products: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Stripe import failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
