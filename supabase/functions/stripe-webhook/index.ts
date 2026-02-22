// supabase/functions/stripe-webhook/index.ts
// Receives Stripe webhook events, identifies the org, and processes
// checkout completions, invoice payments, and subscription changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
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
    const rawBody = await req.text();
    const event = JSON.parse(rawBody);

    // Stripe signature verification would go here in production.
    // For now, we rely on the webhook endpoint being a secret URL.
    // const signature = req.headers.get("stripe-signature");
    // TODO: Verify signature with STRIPE_WEBHOOK_SECRET

    const eventType = event.type as string;
    const eventId = event.id as string;
    const dataObject = event.data?.object as Record<string, unknown>;

    if (!dataObject) {
      return new Response(
        JSON.stringify({ error: "No data object in event" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Identify the org ----
    // Strategy 1: Check metadata on the event data object
    let orgId: string | null =
      (dataObject.metadata as Record<string, string>)?.org_id || null;

    // Strategy 2: If no metadata, match by looking up the Stripe customer in accounts
    if (!orgId && dataObject.customer) {
      const customerId = dataObject.customer as string;

      const { data: account } = await supabase
        .from("accounts")
        .select("org_id")
        .or(`stripe_customer_id_sandbox.eq.${customerId},stripe_customer_id_prod.eq.${customerId}`)
        .limit(1)
        .maybeSingle();

      if (account) {
        orgId = account.org_id;
      }
    }

    // Strategy 3: Match via subscription -> quote -> org
    if (!orgId && dataObject.subscription) {
      const subId = dataObject.subscription as string;
      const { data: quote } = await supabase
        .from("quotes")
        .select("org_id")
        .eq("stripe_subscription_id", subId)
        .limit(1)
        .maybeSingle();

      if (quote) {
        orgId = quote.org_id;
      }
    }

    // Check for duplicate event (idempotency)
    const { data: existingEvent } = await supabase
      .from("payment_events")
      .select("id")
      .eq("stripe_event_id", eventId)
      .maybeSingle();

    if (existingEvent) {
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record the payment event
    if (orgId) {
      // Find the associated quote_id if possible
      let quoteId: string | null = null;

      if (dataObject.metadata) {
        quoteId = (dataObject.metadata as Record<string, string>).quote_id || null;
      }

      if (!quoteId && dataObject.subscription) {
        const { data: quote } = await supabase
          .from("quotes")
          .select("id")
          .eq("stripe_subscription_id", dataObject.subscription as string)
          .maybeSingle();
        quoteId = quote?.id || null;
      }

      if (!quoteId && eventType === "checkout.session.completed" && dataObject.client_reference_id) {
        quoteId = dataObject.client_reference_id as string;
      }

      await supabase.from("payment_events").insert({
        org_id: orgId,
        quote_id: quoteId,
        stripe_event_id: eventId,
        event_type: eventType,
        event_data: dataObject,
      });

      // ---- Handle specific event types ----
      switch (eventType) {
        case "checkout.session.completed": {
          const sessionQuoteId =
            quoteId ||
            (dataObject.client_reference_id as string) ||
            (dataObject.metadata as Record<string, string>)?.quote_id;

          if (sessionQuoteId) {
            const subscriptionId = (dataObject.subscription as string) || null;

            await supabase
              .from("quotes")
              .update({
                payment_status: "paid",
                paid_at: new Date().toISOString(),
                stripe_checkout_session_id: dataObject.id as string,
                stripe_subscription_id: subscriptionId,
              })
              .eq("id", sessionQuoteId);

            // Auto-update opportunity stage to closed_won
            const { data: quote } = await supabase
              .from("quotes")
              .select("opportunity_id")
              .eq("id", sessionQuoteId)
              .maybeSingle();

            if (quote?.opportunity_id) {
              await supabase
                .from("opportunities")
                .update({ stage: "closed_won" })
                .eq("id", quote.opportunity_id);
            }
          }
          break;
        }

        case "invoice.paid": {
          const subscriptionId = dataObject.subscription as string | null;

          if (subscriptionId) {
            // Find the quote associated with this subscription
            const { data: quote } = await supabase
              .from("quotes")
              .select("id, opportunity_id")
              .eq("stripe_subscription_id", subscriptionId)
              .maybeSingle();

            if (quote) {
              await supabase
                .from("quotes")
                .update({
                  payment_status: "paid",
                  paid_at: new Date().toISOString(),
                })
                .eq("id", quote.id);

              // Also mark opportunity as closed_won
              if (quote.opportunity_id) {
                await supabase
                  .from("opportunities")
                  .update({ stage: "closed_won" })
                  .eq("id", quote.opportunity_id);
              }
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const subId = dataObject.id as string;
          const status = dataObject.status as string;

          // Update quote payment_status based on subscription status
          const paymentStatus =
            status === "active" ? "paid" :
            status === "past_due" ? "pending" :
            status === "canceled" ? "failed" :
            "pending";

          await supabase
            .from("quotes")
            .update({ payment_status: paymentStatus })
            .eq("stripe_subscription_id", subId);

          // Update related order status if applicable
          const orderStatus =
            status === "active" ? "active" :
            status === "canceled" ? "cancelled" :
            "pending";

          await supabase
            .from("orders")
            .update({ status: orderStatus })
            .eq("stripe_subscription_id", subId);

          break;
        }

        case "customer.subscription.deleted": {
          const subId = dataObject.id as string;

          await supabase
            .from("quotes")
            .update({ payment_status: "failed" })
            .eq("stripe_subscription_id", subId);

          await supabase
            .from("orders")
            .update({ status: "cancelled" })
            .eq("stripe_subscription_id", subId);

          // Update opportunity stage to closed_lost
          const { data: relatedQuote } = await supabase
            .from("quotes")
            .select("opportunity_id")
            .eq("stripe_subscription_id", subId)
            .maybeSingle();

          if (relatedQuote?.opportunity_id) {
            // Only update if it was closed_won (don't overwrite other stages)
            await supabase
              .from("opportunities")
              .update({ stage: "closed_lost" })
              .eq("id", relatedQuote.opportunity_id)
              .eq("stage", "closed_won");
          }
          break;
        }

        default:
          // Unhandled event type -- we still logged it above
          break;
      }
    }

    return new Response(
      JSON.stringify({ received: true, event_type: eventType, org_id: orgId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Webhook processing failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
