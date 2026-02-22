// supabase/functions/stripe-import-v2/index.ts
// Imports Stripe catalog (products, prices, coupons) into the Stripe-native tables.
// Writes to stripe_products, stripe_prices, stripe_coupons — NOT to the old products table.
// Accepts stripe_instance_id to look up credentials from stripe_instances table.
// All upserts use ON CONFLICT (org_id, stripe_instance_id, stripe_id) DO UPDATE.

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

/** Paginate through a Stripe list endpoint, collecting all items. */
async function stripePaginateAll(
  path: string,
  apiKey: string
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params = new URLSearchParams({ limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);

    const separator = path.includes("?") ? "&" : "?";
    const res = await stripeGet(`${path}${separator}${params.toString()}`, apiKey);
    const data = res.data as Record<string, unknown>[];
    items.push(...data);
    hasMore = res.has_more as boolean;
    if (data.length > 0) {
      startingAfter = (data[data.length - 1] as Record<string, unknown>).id as string;
    }
  }

  return items;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, stripe_instance_id } = await req.json();
    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "org_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!stripe_instance_id) {
      return new Response(
        JSON.stringify({ error: "stripe_instance_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // ---- Import Products ----
    // Fetch both "service" and "good" type products (default listing may omit "service" type)
    const [serviceProducts, goodProducts] = await Promise.all([
      stripePaginateAll("/products?type=service", stripeKey),
      stripePaginateAll("/products?type=good", stripeKey),
    ]);
    const stripeProducts = [...serviceProducts, ...goodProducts];
    let productsUpserted = 0;

    for (const prod of stripeProducts) {
      const productData = {
        org_id,
        stripe_instance_id,
        stripe_id: prod.id as string,
        active: prod.active as boolean,
        name: prod.name as string,
        description: (prod.description as string) || null,
        default_price: typeof prod.default_price === "string"
          ? prod.default_price
          : (prod.default_price as Record<string, unknown>)?.id as string || null,
        images: prod.images || [],
        metadata: prod.metadata || {},
        unit_label: (prod.unit_label as string) || null,
        tax_code: typeof prod.tax_code === "string"
          ? prod.tax_code
          : (prod.tax_code as Record<string, unknown>)?.id as string || null,
        statement_descriptor: (prod.statement_descriptor as string) || null,
        url: (prod.url as string) || null,
        marketing_features: prod.marketing_features || [],
        type: (prod.type as string) || 'service',
        shippable: (prod.shippable as boolean) ?? null,
        package_dimensions: prod.package_dimensions || null,
        livemode: (prod.livemode as boolean) || false,
        stripe_created: prod.created as number || null,
        stripe_updated: prod.updated as number || null,
        synced_at: now,
      };

      const { error: upsertError } = await supabase
        .from("stripe_products")
        .upsert(productData, { onConflict: "org_id,stripe_instance_id,stripe_id" });

      if (upsertError) {
        console.error(`Failed to upsert product ${prod.id}:`, upsertError);
      } else {
        productsUpserted++;
      }
    }

    // ---- Import Prices ----
    const stripePrices = await stripePaginateAll(
      "/prices?expand[]=data.product",
      stripeKey
    );
    let pricesUpserted = 0;

    for (const price of stripePrices) {
      const recurring = price.recurring as Record<string, unknown> | null;
      const productId = typeof price.product === "string"
        ? price.product
        : (price.product as Record<string, unknown>)?.id as string;

      const priceData = {
        org_id,
        stripe_instance_id,
        stripe_id: price.id as string,
        product_stripe_id: productId,
        active: price.active as boolean,
        currency: price.currency as string,
        unit_amount: price.unit_amount as number | null,
        unit_amount_decimal: (price.unit_amount_decimal as string) || null,
        billing_scheme: (price.billing_scheme as string) || "per_unit",
        type: price.type as string,
        recurring_interval: recurring?.interval as string || null,
        recurring_interval_count: recurring?.interval_count as number || null,
        recurring_usage_type: recurring?.usage_type as string || null,
        recurring_meter: recurring?.meter as string || null,
        recurring_aggregate_usage: recurring?.aggregate_usage as string || null,
        recurring_trial_period_days: recurring?.trial_period_days as number || null,
        tiers: price.tiers || null,
        tiers_mode: (price.tiers_mode as string) || null,
        transform_quantity: price.transform_quantity || null,
        lookup_key: (price.lookup_key as string) || null,
        nickname: (price.nickname as string) || null,
        metadata: price.metadata || {},
        tax_behavior: (price.tax_behavior as string) || null,
        custom_unit_amount: price.custom_unit_amount || null,
        currency_options: price.currency_options || null,
        livemode: (price.livemode as boolean) || false,
        stripe_created: price.created as number || null,
        synced_at: now,
      };

      const { error: upsertError } = await supabase
        .from("stripe_prices")
        .upsert(priceData, { onConflict: "org_id,stripe_instance_id,stripe_id" });

      if (upsertError) {
        console.error(`Failed to upsert price ${price.id}:`, upsertError);
      } else {
        pricesUpserted++;
      }
    }

    // ---- Import Coupons ----
    const stripeCoupons = await stripePaginateAll("/coupons", stripeKey);
    let couponsUpserted = 0;

    for (const coupon of stripeCoupons) {
      const couponData = {
        org_id,
        stripe_instance_id,
        stripe_id: coupon.id as string,
        name: (coupon.name as string) || null,
        percent_off: coupon.percent_off as number | null,
        amount_off: coupon.amount_off as number | null,
        currency: (coupon.currency as string) || null,
        duration: coupon.duration as string,
        duration_in_months: coupon.duration_in_months as number | null,
        max_redemptions: coupon.max_redemptions as number | null,
        redeem_by: coupon.redeem_by as number | null,
        times_redeemed: coupon.times_redeemed as number || 0,
        applies_to: coupon.applies_to || null,
        metadata: coupon.metadata || {},
        valid: (coupon.valid as boolean) ?? true,
        livemode: (coupon.livemode as boolean) || false,
        stripe_created: coupon.created as number || null,
        percent_off_precise: coupon.percent_off_precise as number || null,
        currency_options: coupon.currency_options || null,
        synced_at: now,
      };

      const { error: upsertError } = await supabase
        .from("stripe_coupons")
        .upsert(couponData, { onConflict: "org_id,stripe_instance_id,stripe_id" });

      if (upsertError) {
        console.error(`Failed to upsert coupon ${coupon.id}:`, upsertError);
      } else {
        couponsUpserted++;
      }
    }

    // ---- Log the import ----
    // Map instance name to valid environment for sync_log CHECK constraint
    const nameLower = (instance.name || "").toLowerCase();
    const logEnvironment = nameLower.includes("prod") || nameLower.includes("live")
      ? "production"
      : "sandbox";
    await supabase.from("stripe_sync_log").insert({
      org_id,
      entity_type: "pricebook_v2",
      entity_id: org_id,
      environment: logEnvironment,
      action: "import_v2",
      stripe_id: null,
      request_data: { stripe_instance_id, instance_name: instance.name },
      response_data: {
        products_upserted: productsUpserted,
        prices_upserted: pricesUpserted,
        coupons_upserted: couponsUpserted,
      },
    });

    // Update instance last_sync_at
    await supabase
      .from("stripe_instances")
      .update({ last_sync_at: now })
      .eq("id", stripe_instance_id);

    return new Response(
      JSON.stringify({
        imported_products: productsUpserted,
        imported_prices: pricesUpserted,
        imported_coupons: couponsUpserted,
        total_stripe_products: stripeProducts.length,
        total_stripe_prices: stripePrices.length,
        total_stripe_coupons: stripeCoupons.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe-import-v2 error:", message);
    return new Response(
      JSON.stringify({ error: "Stripe import v2 failed", details: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
