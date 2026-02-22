// supabase/functions/sf-oauth-callback/index.ts
// Handles the Salesforce OAuth2 redirect callback.
// Exchanges the authorization code for access + refresh tokens
// and stores them in the integrations table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // state = integration_id

    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: "Missing code or state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const integrationId = state;

    // Create admin Supabase client (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the integration record to get the org's SF credentials
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("provider", "salesforce")
      .single();

    if (fetchError || !integration) {
      return new Response(
        JSON.stringify({ error: "Integration not found", details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = integration.credentials || {};
    const clientId = credentials.client_id;
    const clientSecret = credentials.client_secret;
    const redirectUri = credentials.redirect_uri || `${supabaseUrl}/functions/v1/sf-oauth-callback`;
    const loginUrl = credentials.login_url || "https://login.salesforce.com";

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Salesforce client_id or client_secret not configured in integration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Exchange authorization code for tokens
    const tokenUrl = `${loginUrl}/services/oauth2/token`;
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text();
      return new Response(
        JSON.stringify({ error: "Salesforce token exchange failed", details: errorBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenRes.json();

    // Store tokens back into the integration's credentials JSONB
    const updatedCredentials = {
      ...credentials,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      instance_url: tokenData.instance_url,
      token_type: tokenData.token_type,
      issued_at: tokenData.issued_at,
      id: tokenData.id,
      signature: tokenData.signature,
    };

    const { error: updateError } = await supabase
      .from("integrations")
      .update({
        credentials: updatedCredentials,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", integrationId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to store tokens", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Redirect the user back to the app with a success indicator
    const appRedirect = credentials.app_redirect_url || `${supabaseUrl}`;
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: `${appRedirect}?sf_connected=true&integration_id=${integrationId}`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
