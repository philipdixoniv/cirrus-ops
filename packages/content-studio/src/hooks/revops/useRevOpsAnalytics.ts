import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useRevOpsAnalytics(ownerIds?: string[] | null) {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const pipelineQuery = useQuery({
    queryKey: ["revops-analytics", "pipeline", activeOrgId, ownerIds],
    queryFn: async () => {
      const supabase = getSupabase();
      let oppsQuery = supabase
        .from("opportunities")
        .select("id, name, amount, stage, owner_id, expected_close_date, forecast_category, accounts(name)")
        .eq("org_id", activeOrgId)
        .not("stage", "in", '("closed_won","closed_lost")');

      if (ownerIds) {
        oppsQuery = oppsQuery.in("owner_id", ownerIds);
      }

      const [oppsRes, weightsRes] = await Promise.all([
        oppsQuery,
        supabase.from("forecast_weights").select("stage, weight").eq("org_id", activeOrgId),
      ]);

      if (oppsRes.error) throw oppsRes.error;
      if (weightsRes.error) throw weightsRes.error;

      const weightMap: Record<string, number> = {};
      for (const w of weightsRes.data || []) {
        weightMap[w.stage] = Number(w.weight);
      }

      const pipelineData = (oppsRes.data || []).map((opp: any) => ({
        ...opp,
        weightedAmount: Number(opp.amount) * (weightMap[opp.stage] || 0),
      }));

      return { pipelineData, forecastWeights: weightsRes.data || [] };
    },
    enabled: !!activeOrgId,
  });

  const mrrQuery = useQuery({
    queryKey: ["revops-analytics", "mrr", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const since = new Date();
      since.setDate(since.getDate() - 90);

      const { data, error } = await supabase
        .from("mrr_snapshots")
        .select("*")
        .eq("org_id", activeOrgId)
        .gte("snapshot_date", since.toISOString().split("T")[0])
        .order("snapshot_date");

      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const pipelineData = pipelineQuery.data?.pipelineData || [];
  const forecastWeights = pipelineQuery.data?.forecastWeights || [];
  const mrrSnapshots = mrrQuery.data || [];

  const loadRevenueEntries = useCallback(async () => {
    if (!activeOrgId) return [];
    const supabase = getSupabase();
    const { data } = await supabase
      .from("revenue_entries")
      .select("*")
      .eq("org_id", activeOrgId)
      .order("period_start", { ascending: false })
      .limit(100);
    return data || [];
  }, [activeOrgId]);

  const pipelineSummary = useMemo(() => {
    const stages: Record<string, { count: number; totalAmount: number; weightedAmount: number }> = {};
    for (const opp of pipelineData) {
      if (!stages[opp.stage]) {
        stages[opp.stage] = { count: 0, totalAmount: 0, weightedAmount: 0 };
      }
      stages[opp.stage].count++;
      stages[opp.stage].totalAmount += Number(opp.amount);
      stages[opp.stage].weightedAmount += opp.weightedAmount;
    }
    return stages;
  }, [pipelineData]);

  const mrrOverTime = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const snap of mrrSnapshots) {
      const date = snap.snapshot_date;
      if (!byDate[date]) byDate[date] = 0;
      byDate[date] += Number(snap.mrr);
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, mrr]) => ({ date, mrr, arr: (mrr as number) * 12 }));
  }, [mrrSnapshots]);

  const churnMetrics = useMemo(() => {
    const movements: Record<string, number> = {
      new: 0,
      expansion: 0,
      contraction: 0,
      churn: 0,
      reactivation: 0,
    };
    for (const snap of mrrSnapshots) {
      const mt = snap.movement_type as string;
      if (mt in movements) movements[mt] += Number(snap.mrr);
    }
    const totalMrr = movements.new + movements.expansion + movements.reactivation;
    const netChurnRate = totalMrr > 0 ? movements.churn / totalMrr : 0;
    return { ...movements, netChurnRate };
  }, [mrrSnapshots]);

  const updateForecastWeight = useCallback(
    async (stage: string, weight: number) => {
      if (!activeOrgId) return;
      const supabase = getSupabase();
      const { error } = await supabase
        .from("forecast_weights")
        .upsert({ org_id: activeOrgId, stage, weight }, { onConflict: "org_id,stage" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["revops-analytics", "pipeline", activeOrgId] });
    },
    [activeOrgId, queryClient],
  );

  return {
    pipelineData,
    mrrSnapshots,
    forecastWeights,
    loading: pipelineQuery.isLoading || mrrQuery.isLoading,
    error: pipelineQuery.error?.message || mrrQuery.error?.message || null,
    loadRevenueEntries,
    pipelineSummary,
    mrrOverTime,
    churnMetrics,
    updateForecastWeight,
  };
}
