// supabase/functions/create-checkout/index.ts
// Creates a Stripe Checkout Session for a given quote.
// Handles mixed recurring (subscription) and one-time (add_invoice_items) line items.
// Applies combined discount as a Stripe Coupon.

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
          Object.assign(result, flattenParams(item as Record<string, unknown>, `${fullKey}[${index}]`));
        } else {
          result[`${fullKey}[${index}]`] = String(item);
        }
      });
    } else if (value !== null && value !== undefined && typeof value === "object") {
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
    const { quote_id, org_id, success_url, cancel_url } = await req.json();

    if (!quote_id || !org_id) {
      return new Response(
        JSON.stringify({ error: "quote_id and org_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the quote with line items and services
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        *,
        quote_line_items(*),
        quote_services(*),
        opportunities!inner(account_id, name)
      `)
      .eq("id", quote_id)
      .eq("org_id", org_id)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: "Quote not found", details: quoteError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which Stripe environment to use
    // Prefer production if available, fallback to sandbox
    let integration = await supabase
      .from("integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("provider", "stripe")
      .eq("environment", "production")
      .eq("is_active", true)
      .maybeSingle();

    let environment = "production";

    if (!integration.data) {
      integration = await supabase
        .from("integrations")
        .select("*")
        .eq("org_id", org_id)
        .eq("provider", "stripe")
        .eq("environment", "sandbox")
        .eq("is_active", true)
        .maybeSingle();

      environment = "sandbox";
    }

    if (!integration.data) {
      throw new Error("No active Stripe integration found");
    }

    const stripeKey =
      integration.data.credentials?.api_key ||
      integration.data.credentials?.secret_key ||
      integration.data.credentials?.test_secret_key ||
      integration.data.credentials?.live_secret_key;

    if (!stripeKey) {
      throw new Error("Stripe API key not found in integration credentials");
    }

    // Map billing_frequency to the billing_interval key used in stripe_price_map
    const billingIntervalMap: Record<string, string> = {
      monthly: "monthly",
      quarterly: "quarterly",
      annual: "annual",
      annually: "annual",
    };
    const billingInterval =
      billingIntervalMap[quote.billing_frequency] || "monthly";

    // Fetch stripe price mappings for this org's products
    const { data: priceMaps } = await supabase
      .from("stripe_price_map")
      .select("*")
      .eq("org_id", org_id)
      .eq("environment", environment)
      .eq("is_active", true);

    const priceMapByProductAndInterval = new Map<string, string>();
    const priceMapByProductOneTime = new Map<string, string>();

    for (const pm of priceMaps || []) {
      if (pm.billing_interval === billingInterval) {
        priceMapByProductAndInterval.set(pm.product_id, pm.stripe_price_id);
      }
      // For one-time products, they are stored with billing_interval 'monthly'
      priceMapByProductOneTime.set(pm.product_id, pm.stripe_price_id);
    }

    // ---- Fallback: if stripe_price_map is empty, try stripe_prices (native tables) ----
    // This enables the Stripe-native pricebook to work with checkout without migration.
    let useNativePrices = false;
    const nativePriceBySlugAndInterval = new Map<string, string>();
    const nativePriceBySlugOneTime = new Map<string, string>();

    if (priceMapByProductAndInterval.size === 0 && priceMapByProductOneTime.size === 0) {
      const { data: nativePrices } = await supabase
        .from("stripe_prices")
        .select("*, stripe_products:product_stripe_id(stripe_id, metadata)")
        .eq("org_id", org_id)
        .eq("environment", environment)
        .eq("active", true);

      // Also fetch stripe_products to resolve slug from metadata
      const { data: nativeProducts } = await supabase
        .from("stripe_products")
        .select("stripe_id, metadata")
        .eq("org_id", org_id)
        .eq("environment", environment)
        .eq("active", true);

      // Build a map from product_key/cirrus_slug -> stripe_product_id
      const nativeProductBySlug = new Map<string, string>();
      for (const np of nativeProducts || []) {
        const slug = np.metadata?.product_key || np.metadata?.cirrus_slug;
        if (slug) nativeProductBySlug.set(slug, np.stripe_id);
      }

      // Map billing intervals for native prices
      const nativeIntervalMap: Record<string, { interval: string; interval_count: number }> = {
        monthly: { interval: "month", interval_count: 1 },
        quarterly: { interval: "month", interval_count: 3 },
        annual: { interval: "year", interval_count: 1 },
      };
      const targetInterval = nativeIntervalMap[billingInterval];

      for (const np of nativePrices || []) {
        // Find the slug for this price's product
        let productSlug: string | undefined;
        for (const [slug, stripeId] of nativeProductBySlug) {
          if (stripeId === np.product_stripe_id) {
            productSlug = slug;
            break;
          }
        }
        if (!productSlug) continue;

        if (np.type === "one_time") {
          nativePriceBySlugOneTime.set(productSlug, np.stripe_id);
        } else if (
          targetInterval &&
          np.recurring_interval === targetInterval.interval &&
          np.recurring_interval_count === targetInterval.interval_count
        ) {
          nativePriceBySlugAndInterval.set(productSlug, np.stripe_id);
        }
      }

      if (nativePriceBySlugAndInterval.size > 0 || nativePriceBySlugOneTime.size > 0) {
        useNativePrices = true;
      }
    }

    // Look up product slugs -> IDs to map line items
    const { data: products } = await supabase
      .from("products")
      .select("id, slug, type")
      .eq("org_id", org_id);

    const productBySlug = new Map<string, { id: string; type: string }>();
    const productById = new Map<string, { slug: string; type: string }>();
    for (const p of products || []) {
      productBySlug.set(p.slug, { id: p.id, type: p.type });
      productById.set(p.id, { slug: p.slug, type: p.type });
    }

    // Build Checkout Session line items
    // Recurring items go into line_items, one-time items go into subscription_data.add_invoice_items
    const recurringLineItems: Array<{ price: string; quantity: number }> = [];
    const oneTimeItems: Array<{ price: string; quantity: number }> = [];

    for (const li of quote.quote_line_items || []) {
      // Try to find the product by feature_id (which should be the product slug)
      const product = productBySlug.get(li.feature_id);
      if (!product) continue;

      let stripePriceId: string | undefined;

      if (useNativePrices) {
        // Use Stripe-native price lookup (by slug)
        if (product.type === "one_time") {
          stripePriceId = nativePriceBySlugOneTime.get(li.feature_id);
        } else {
          stripePriceId = nativePriceBySlugAndInterval.get(li.feature_id);
        }
      } else {
        // Use legacy stripe_price_map lookup (by product UUID)
        if (product.type === "one_time") {
          stripePriceId = priceMapByProductOneTime.get(product.id);
        } else {
          stripePriceId = priceMapByProductAndInterval.get(product.id);
        }
      }

      if (stripePriceId) {
        if (product.type === "one_time") {
          oneTimeItems.push({ price: stripePriceId, quantity: li.quantity });
        } else {
          recurringLineItems.push({
            price: stripePriceId,
            quantity: li.quantity * (quote.seat_count || 1),
          });
        }
      }
    }

    // Services are one-time charges
    for (const svc of quote.quote_services || []) {
      const product = productBySlug.get(svc.service_id);
      if (!product) continue;

      let stripePriceId: string | undefined;
      if (useNativePrices) {
        stripePriceId = nativePriceBySlugOneTime.get(svc.service_id);
      } else {
        stripePriceId = priceMapByProductOneTime.get(product.id);
      }
      if (stripePriceId) {
        oneTimeItems.push({ price: stripePriceId, quantity: svc.quantity || 1 });
      }
    }

    if (recurringLineItems.length === 0 && oneTimeItems.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No Stripe prices found for quote line items. Ensure products are synced to Stripe.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Handle combined discount as a Stripe Coupon ----
    let couponId: string | undefined;
    const additionalDiscount = parseFloat(quote.additional_discount) || 0;

    if (additionalDiscount > 0) {
      // Create a one-off coupon for this quote
      const couponParams: Record<string, string> = {
        percent_off: String(additionalDiscount),
        duration: "forever",
        name: `Quote ${quote.id} discount (${additionalDiscount}%)`,
        "metadata[quote_id]": quote_id,
        "metadata[org_id]": org_id,
      };

      const coupon = await stripeRequest("POST", "/coupons", stripeKey, couponParams);
      couponId = coupon.id as string;
    }

    // ---- Build Checkout Session ----
    const hasRecurring = recurringLineItems.length > 0;
    const mode = hasRecurring ? "subscription" : "payment";

    const sessionParams: Record<string, unknown> = {
      mode,
      client_reference_id: quote_id,
      success_url: success_url || `${supabaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${supabaseUrl}/checkout/cancel`,
      metadata: {
        quote_id,
        org_id,
      },
    };

    // Add recurring line items
    if (hasRecurring) {
      sessionParams.line_items = recurringLineItems;

      // One-time items in a subscription checkout go as add_invoice_items
      if (oneTimeItems.length > 0) {
        sessionParams.subscription_data = {
          add_invoice_items: oneTimeItems,
          metadata: { quote_id, org_id },
        };
      }
    } else {
      // Pure one-time payment
      sessionParams.line_items = oneTimeItems;
    }

    // Apply coupon if discount exists
    if (couponId) {
      if (hasRecurring) {
        if (!sessionParams.subscription_data) {
          sessionParams.subscription_data = { metadata: { quote_id, org_id } };
        }
        (sessionParams.subscription_data as Record<string, unknown>).coupon = couponId;
      } else {
        sessionParams.discounts = [{ coupon: couponId }];
      }
    }

    // Customer: look up or create Stripe customer from the quote's account
    const accountId = quote.opportunities?.account_id;
    if (accountId) {
      const { data: account } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", accountId)
        .single();

      if (account) {
        const customerIdField =
          environment === "production"
            ? "stripe_customer_id_prod"
            : "stripe_customer_id_sandbox";

        let customerId = account[customerIdField];

        if (!customerId) {
          // Create a new Stripe customer
          const customerParams = flattenParams({
            name: account.name,
            metadata: { cirrus_account_id: account.id, org_id },
          });

          const customer = await stripeRequest("POST", "/customers", stripeKey, customerParams);
          customerId = customer.id as string;

          await supabase
            .from("accounts")
            .update({ [customerIdField]: customerId })
            .eq("id", accountId);
        }

        sessionParams.customer = customerId;
      }
    }

    // Create the Checkout Session
    const session = await stripeRequest(
      "POST",
      "/checkout/sessions",
      stripeKey,
      flattenParams(sessionParams)
    );

    // Store the checkout session ID on the quote
    await supabase
      .from("quotes")
      .update({
        stripe_checkout_session_id: session.id as string,
        stripe_payment_link: session.url as string,
        payment_status: "pending",
      })
      .eq("id", quote_id);

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Checkout creation failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
