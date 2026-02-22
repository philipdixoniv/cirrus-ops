// supabase/functions/stripe-validate-key/index.ts
// Validates a Stripe API key by calling /v1/account server-side.
// This avoids CORS issues when validating keys from the browser.

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

  try {
    const { api_key } = await req.json();
    if (!api_key) {
      return new Response(
        JSON.stringify({ error: "api_key is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${api_key}` },
    });

    const acct = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: acct?.error?.message || `Stripe returned ${res.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        id: acct.id,
        displayName:
          acct.display_name ||
          acct.business_name ||
          acct.settings?.dashboard?.display_name ||
          acct.business_profile?.name ||
          null,
        email: acct.email || acct.support_email || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe-validate-key error:", message);
    return new Response(
      JSON.stringify({ error: "Failed to validate Stripe key", details: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
