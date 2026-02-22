// supabase/functions/shared-quote/index.ts
// Public (no auth) endpoint for viewing a shared quote via token.
// Validates the token, checks expiry and is_active status,
// increments view_count, and returns the full quote data.

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Extract token from URL params
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing token parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up the share link
    const { data: shareLink, error: linkError } = await supabase
      .from("quote_share_links")
      .select("*")
      .eq("token", token)
      .single();

    if (linkError || !shareLink) {
      return new Response(
        JSON.stringify({ error: "Invalid or unknown share link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if link is active
    if (!shareLink.is_active) {
      return new Response(
        JSON.stringify({ error: "This share link has been deactivated" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (shareLink.expires_at) {
      const expiresAt = new Date(shareLink.expires_at);
      if (expiresAt < new Date()) {
        return new Response(
          JSON.stringify({ error: "This share link has expired" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Increment view_count and update last_viewed_at
    await supabase
      .from("quote_share_links")
      .update({
        view_count: (shareLink.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", shareLink.id);

    // Fetch the full quote data
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        id,
        version_number,
        status,
        term_length,
        billing_frequency,
        seat_count,
        meeting_intelligence_hours,
        live_coaching_hours,
        plan,
        payment_terms_net,
        additional_discount,
        mrr,
        arr,
        tcv,
        created_at,
        updated_at,
        payment_status,
        stripe_payment_link,
        quote_line_items(
          id,
          feature_id,
          feature_name,
          unit_price,
          quantity,
          line_total,
          hidden
        ),
        quote_services(
          id,
          service_id,
          service_name,
          duration,
          quantity,
          price,
          hidden
        ),
        opportunities(
          name,
          accounts(name),
          contacts(first_name, last_name, title, email)
        )
      `)
      .eq("id", shareLink.quote_id)
      .single();

    if (quoteError || !quote) {
      return new Response(
        JSON.stringify({ error: "Quote not found", details: quoteError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out hidden items and strip hidden field from response
    if (quote.quote_line_items) {
      quote.quote_line_items = quote.quote_line_items
        .filter((li: Record<string, unknown>) => !li.hidden)
        .map(({ hidden, ...rest }: Record<string, unknown>) => rest);
    }
    if (quote.quote_services) {
      quote.quote_services = quote.quote_services
        .filter((svc: Record<string, unknown>) => !svc.hidden)
        .map(({ hidden, ...rest }: Record<string, unknown>) => rest);
    }

    // Fetch org name for branding
    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug")
      .eq("id", shareLink.org_id)
      .single();

    // Check if there are any documents available for download
    const { data: documents } = await supabase
      .from("quote_documents")
      .select("id, document_type, file_name, created_at")
      .eq("quote_id", shareLink.quote_id)
      .order("created_at", { ascending: false });

    return new Response(
      JSON.stringify({
        organization: {
          name: org?.name || null,
          slug: org?.slug || null,
        },
        quote,
        documents: documents || [],
        share_link: {
          expires_at: shareLink.expires_at,
          view_count: (shareLink.view_count || 0) + 1,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve shared quote", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
