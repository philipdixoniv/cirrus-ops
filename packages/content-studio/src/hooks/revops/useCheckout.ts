import { useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";

export function useCheckout() {
  const { activeOrgId } = useOrg();
  const { activeInstanceId } = useStripeInstances();

  const generatePaymentLink = useCallback(
    async (opts: {
      quoteId: string;
      lineItems: Array<{ price: string; quantity: number }>;
      addInvoiceItems?: Array<{ price: string; quantity: number }>;
      couponId?: string;
      customerId?: string;
      successUrl?: string;
      cancelUrl?: string;
      metadata?: Record<string, string>;
    }) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      if (!activeInstanceId)
        throw new Error("No Stripe instance selected");
      const supabase = getSupabase();

      const { data, error } = await supabase.functions.invoke(
        "stripe-create-checkout",
        {
          body: {
            org_id: activeOrgId,
            instance_id: activeInstanceId,
            quote_id: opts.quoteId,
            line_items: opts.lineItems,
            add_invoice_items: opts.addInvoiceItems || [],
            coupon_id: opts.couponId || null,
            customer_id: opts.customerId || null,
            success_url:
              opts.successUrl ||
              `${window.location.origin}/revops/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:
              opts.cancelUrl ||
              `${window.location.origin}/revops/checkout/cancel`,
            metadata: {
              ...(opts.metadata || {}),
              cirrus_org_id: activeOrgId,
              cirrus_quote_id: opts.quoteId,
            },
          },
        },
      );
      if (error)
        throw new Error(error.message || "Checkout session creation failed");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    [activeOrgId, activeInstanceId],
  );

  const getPaymentStatus = useCallback(
    async (sessionId: string) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      if (!activeInstanceId)
        throw new Error("No Stripe instance selected");
      const supabase = getSupabase();

      const { data, error } = await supabase.functions.invoke(
        "stripe-checkout-status",
        {
          body: {
            org_id: activeOrgId,
            instance_id: activeInstanceId,
            session_id: sessionId,
          },
        },
      );
      if (error) throw new Error(error.message || "Failed to get status");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    [activeOrgId, activeInstanceId],
  );

  const getPaymentEvents = useCallback(
    async (opts?: { quoteId?: string; limit?: number }) => {
      if (!activeOrgId) return [];
      const supabase = getSupabase();

      let query = supabase
        .from("payment_events")
        .select("*")
        .eq("org_id", activeOrgId)
        .order("created_at", { ascending: false });

      if (activeInstanceId) {
        query = query.eq("instance_id", activeInstanceId);
      }
      if (opts?.quoteId) {
        query = query.eq("quote_id", opts.quoteId);
      }
      if (opts?.limit) {
        query = query.limit(opts.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    [activeOrgId, activeInstanceId],
  );

  return {
    generatePaymentLink,
    getPaymentStatus,
    getPaymentEvents,
  };
}
