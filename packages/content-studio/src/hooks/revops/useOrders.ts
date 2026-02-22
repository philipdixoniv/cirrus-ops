import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useOrders() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ["orders", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          accounts ( id, name ),
          quotes ( id, version_number, status ),
          opportunities ( id, name )
        `)
        .eq("org_id", activeOrgId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const getOrder = useCallback(async (id: string) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        accounts ( id, name ),
        quotes ( id, version_number, status, term_length, billing_frequency ),
        opportunities ( id, name, stage ),
        order_line_items ( * )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }, []);

  const createOrderFromQuote = useCallback(
    async (quoteId: string) => {
      if (!activeOrgId) return null;
      const supabase = getSupabase();

      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select(`
          *,
          opportunity:opportunities ( id, account_id ),
          quote_line_items ( * ),
          quote_services ( * )
        `)
        .eq("id", quoteId)
        .single();

      if (quoteError) throw quoteError;

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          org_id: activeOrgId,
          quote_id: quoteId,
          opportunity_id: quote.opportunity_id,
          account_id: quote.opportunity?.account_id,
          order_number: orderNumber,
          status: "pending",
          stripe_subscription_id: quote.stripe_subscription_id,
          mrr: quote.mrr,
          arr: quote.arr,
          tcv: quote.tcv,
          start_date: new Date().toISOString().split("T")[0],
          record_type: quote.record_type || "new_customer",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const lineItems = (quote.quote_line_items || []).map((li: any) => ({
        org_id: activeOrgId,
        order_id: order.id,
        product_name: li.feature_name,
        unit_price: li.unit_price,
        quantity: li.quantity,
        line_total: li.line_total,
      }));

      for (const svc of quote.quote_services || []) {
        lineItems.push({
          org_id: activeOrgId,
          order_id: order.id,
          product_name: svc.service_name,
          unit_price: svc.price,
          quantity: svc.quantity,
          line_total: svc.price * svc.quantity,
        });
      }

      if (lineItems.length > 0) {
        const { error: liError } = await supabase.from("order_line_items").insert(lineItems);
        if (liError) throw liError;
      }

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      return order;
    },
    [activeOrgId, queryClient],
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    [queryClient],
  );

  return {
    orders: ordersQuery.data || [],
    loading: ordersQuery.isLoading,
    error: ordersQuery.error?.message || null,
    getOrder,
    createOrderFromQuote,
    updateOrderStatus,
    refetch: ordersQuery.refetch,
  };
}
