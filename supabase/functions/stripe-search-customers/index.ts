// supabase/functions/stripe-search-customers/index.ts
// Searches Stripe customers by name for the autocomplete in quote creation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, query, instance_id } = await req.json();

    if (!org_id || !query) {
      return new Response(
        JSON.stringify({ error: "org_id and query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the Stripe instance
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
        JSON.stringify({ customers: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey =
      instance.credentials?.api_key ||
      instance.credentials?.secret_key ||
      instance.credentials?.test_secret_key ||
      instance.credentials?.live_secret_key;

    if (!stripeKey) {
      return new Response(
        JSON.stringify({ customers: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search Stripe customers by name
    const searchQuery = encodeURIComponent(`name~'${query}'`);
    const res = await fetch(
      `https://api.stripe.com/v1/customers/search?query=${searchQuery}&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Stripe-Version": "2024-04-10",
        },
      }
    );

    const data = await res.json();
    const customers = (data.data || []).map((c: Record<string, unknown>) => ({
      stripe_id: c.id,
      name: c.name || c.email || "Unknown",
      email: c.email || null,
    }));

    return new Response(
      JSON.stringify({ customers }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ customers: [], error: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
