// supabase/functions/stripe-link-customer/index.ts
// Links or creates a Stripe customer for a given account.
// Called after quote save to pre-link accounts to Stripe customers.

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
      "Stripe-Version": "2024-04-10",
    },
  };

  if (body) {
    options.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(url, options);
  return (await res.json()) as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, account_id, account_name, instance_id } = await req.json();

    if (!org_id || !account_id || !account_name) {
      return new Response(
        JSON.stringify({ error: "org_id, account_id, and account_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the Stripe instance — prefer specific instance_id if provided
    let instanceQuery = supabase
      .from("stripe_instances")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (instance_id) {
      instanceQuery = instanceQuery.eq("id", instance_id);
    } else {
      instanceQuery = instanceQuery.order("created_at").limit(1);
    }

    const { data: instance } = await instanceQuery.maybeSingle();

    if (!instance) {
      return new Response(
        JSON.stringify({ error: "No active Stripe instance" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey =
      instance.credentials?.api_key ||
      instance.credentials?.secret_key ||
      instance.credentials?.test_secret_key ||
      instance.credentials?.live_secret_key;
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "No Stripe API key configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mode = stripeKey.startsWith("sk_live") || stripeKey.startsWith("rk_live") ? "live" : "test";
    const customerIdField = mode === "live" ? "stripe_customer_id_prod" : "stripe_customer_id_sandbox";

    // Check if account already has a Stripe customer
    const { data: account } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", account_id)
      .eq("org_id", org_id)
      .single();

    if (!account) {
      return new Response(
        JSON.stringify({ error: "Account not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (account[customerIdField]) {
      return new Response(
        JSON.stringify({ customer_id: account[customerIdField], already_linked: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search Stripe for existing customer by name
    const searchQuery = encodeURIComponent(`name:'${account_name}'`);
    const searchResult = await stripeRequest(
      "GET",
      `/customers/search?query=${searchQuery}`,
      stripeKey
    );

    const searchData = searchResult.data as Array<Record<string, unknown>> | undefined;
    let customerId: string;

    if (searchData && searchData.length > 0) {
      customerId = searchData[0].id as string;
    } else {
      // Create a new Stripe customer
      const customer = await stripeRequest("POST", "/customers", stripeKey, {
        name: account_name,
        "metadata[cirrus_account_id]": account_id,
        "metadata[org_id]": org_id,
      });
      customerId = customer.id as string;
    }

    // Link customer ID to account
    await supabase
      .from("accounts")
      .update({ [customerIdField]: customerId })
      .eq("id", account_id);

    return new Response(
      JSON.stringify({ customer_id: customerId, already_linked: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to link Stripe customer", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
