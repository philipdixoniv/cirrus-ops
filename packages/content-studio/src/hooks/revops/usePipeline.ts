import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function usePipeline(ownerIds?: string[] | null) {
  const { activeOrgId } = useOrg();

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", "accounts", activeOrgId, ownerIds],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("get_pipeline_by_account", {
        p_org_id: activeOrgId,
        p_owner_ids: ownerIds || null,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const staleQuery = useQuery({
    queryKey: ["pipeline", "stale", activeOrgId, ownerIds],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("get_stale_quotes", {
        p_org_id: activeOrgId,
        p_stale_days: 14,
        p_owner_ids: ownerIds || null,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const waterfallQuery = useQuery({
    queryKey: ["pipeline", "waterfall", activeOrgId, ownerIds],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("get_pipeline_waterfall", {
        p_org_id: activeOrgId,
        p_weeks: 12,
        p_owner_ids: ownerIds || null,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const accountPipeline = pipelineQuery.data || [];
  const staleQuotes = staleQuery.data || [];
  const waterfall = waterfallQuery.data || [];

  const summaryCards = useMemo(() => {
    const totalPipeline = accountPipeline.reduce(
      (sum: number, a: any) => sum + Number(a.total_pipeline_value || 0),
      0,
    );
    const staleCount = staleQuotes.length;
    const activeAccounts = accountPipeline.length;
    const totalContacts = accountPipeline.reduce(
      (sum: number, a: any) => sum + (a.contact_count || 0),
      0,
    );

    const ages = staleQuotes.map((q: any) => q.age_days || 0);
    const avgDealAge =
      ages.length > 0 ? Math.round(ages.reduce((s: number, a: number) => s + a, 0) / ages.length) : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newPipeline = waterfall
      .filter((w: any) => new Date(w.week_start) >= thirtyDaysAgo)
      .reduce((sum: number, w: any) => sum + Number(w.total_tcv || 0), 0);

    return { totalPipeline, newPipeline, staleCount, avgDealAge, activeAccounts, totalContacts };
  }, [accountPipeline, staleQuotes, waterfall]);

  const reload = useCallback(() => {
    pipelineQuery.refetch();
    staleQuery.refetch();
    waterfallQuery.refetch();
  }, [pipelineQuery, staleQuery, waterfallQuery]);

  return {
    accountPipeline,
    staleQuotes,
    waterfall,
    loading: pipelineQuery.isLoading,
    error: pipelineQuery.error?.message || staleQuery.error?.message || null,
    summaryCards,
    reload,
  };
}
