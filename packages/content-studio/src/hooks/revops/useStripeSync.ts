import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";
import { useStripeInstances } from "@/contexts/StripeInstanceContext";

export function useStripeSync() {
  const { activeOrgId } = useOrg();
  const { activeInstanceId } = useStripeInstances();
  const queryClient = useQueryClient();

  const syncLogQuery = useQuery({
    queryKey: ["stripeSync", activeOrgId, activeInstanceId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("stripe_sync_log")
        .select("*")
        .eq("org_id", activeOrgId)
        .eq("instance_id", activeInstanceId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId && !!activeInstanceId,
  });

  const syncLog = syncLogQuery.data || [];

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["stripeSync", activeOrgId, activeInstanceId],
      }),
    [queryClient, activeOrgId, activeInstanceId],
  );

  const syncProducts = useCallback(async () => {
    if (!activeOrgId || !activeInstanceId) {
      throw new Error("No organization or Stripe instance selected");
    }
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke(
      "stripe-sync-pricebook",
      {
        body: {
          org_id: activeOrgId,
          instance_id: activeInstanceId,
        },
      },
    );
    if (error) throw new Error(error.message || "Sync failed");
    if (data?.error) throw new Error(data.error);
    invalidate();
    queryClient.invalidateQueries({
      queryKey: ["stripePricebook", activeOrgId, activeInstanceId],
    });
    return data;
  }, [activeOrgId, activeInstanceId, invalidate, queryClient]);

  const syncSingleProduct = useCallback(
    async (productId: string) => {
      if (!activeOrgId || !activeInstanceId) {
        throw new Error("No organization or Stripe instance selected");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke(
        "stripe-sync-product",
        {
          body: {
            org_id: activeOrgId,
            instance_id: activeInstanceId,
            product_id: productId,
          },
        },
      );
      if (error) throw new Error(error.message || "Sync failed");
      if (data?.error) throw new Error(data.error);
      invalidate();
      queryClient.invalidateQueries({
        queryKey: ["stripePricebook", activeOrgId, activeInstanceId],
      });
      return data;
    },
    [activeOrgId, activeInstanceId, invalidate, queryClient],
  );

  const importFromStripe = useCallback(async () => {
    if (!activeOrgId || !activeInstanceId) {
      throw new Error("No organization or Stripe instance selected");
    }
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke(
      "stripe-import-pricebook",
      {
        body: {
          org_id: activeOrgId,
          instance_id: activeInstanceId,
        },
      },
    );
    if (error) throw new Error(error.message || "Import failed");
    if (data?.error) throw new Error(data.error);
    invalidate();
    queryClient.invalidateQueries({
      queryKey: ["stripePricebook", activeOrgId, activeInstanceId],
    });
    return data;
  }, [activeOrgId, activeInstanceId, invalidate, queryClient]);

  const promoteToProduction = useCallback(
    async (targetInstanceId: string, productStripeIds?: string[]) => {
      if (!activeOrgId || !activeInstanceId) {
        throw new Error("No organization or Stripe instance selected");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke(
        "stripe-promote-to-production",
        {
          body: {
            org_id: activeOrgId,
            source_instance_id: activeInstanceId,
            target_instance_id: targetInstanceId,
            product_stripe_ids: productStripeIds || null,
          },
        },
      );
      if (error) throw new Error(error.message || "Promotion failed");
      if (data?.error) throw new Error(data.error);
      invalidate();
      return data;
    },
    [activeOrgId, activeInstanceId, invalidate],
  );

  const getSyncLog = useCallback(
    async (opts?: { limit?: number }) => {
      if (!activeOrgId || !activeInstanceId) return [];
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("stripe_sync_log")
        .select("*")
        .eq("org_id", activeOrgId)
        .eq("instance_id", activeInstanceId)
        .order("created_at", { ascending: false })
        .limit(opts?.limit || 50);
      if (error) throw error;
      return data || [];
    },
    [activeOrgId, activeInstanceId],
  );

  const getPriceMap = useCallback(async () => {
    if (!activeOrgId || !activeInstanceId) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("stripe_prices")
      .select(
        "id, stripe_price_id, product_stripe_id, billing_interval, recurring_interval, recurring_interval_count, unit_amount, type, is_active",
      )
      .eq("org_id", activeOrgId)
      .eq("instance_id", activeInstanceId)
      .eq("is_active", true);
    if (error) throw error;
    return (data || []).map((p: any) => ({
      product_id: p.product_stripe_id,
      stripe_price_id: p.stripe_price_id,
      billing_interval:
        p.billing_interval ||
        (p.recurring_interval === "year"
          ? "annual"
          : p.recurring_interval === "month" &&
              p.recurring_interval_count === 3
            ? "quarterly"
            : "monthly"),
      is_active: p.is_active,
      unit_amount: p.unit_amount,
      type: p.type,
    }));
  }, [activeOrgId, activeInstanceId]);

  return {
    syncLog,
    loading: syncLogQuery.isLoading,
    error: syncLogQuery.error?.message || null,
    syncProducts,
    syncSingleProduct,
    importFromStripe,
    promoteToProduction,
    getSyncLog,
    getPriceMap,
    refetch: syncLogQuery.refetch,
  };
}
