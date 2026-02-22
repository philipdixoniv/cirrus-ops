import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useEngagement(userIds?: string[], sinceDays = 30) {
  const { activeOrgId } = useOrg();

  const engagementQuery = useQuery({
    queryKey: ["engagement", activeOrgId, userIds, sinceDays],
    queryFn: async () => {
      if (!userIds || userIds.length === 0) return [];
      const supabase = getSupabase();
      const since = new Date();
      since.setDate(since.getDate() - sinceDays);

      const { data, error } = await supabase.rpc("get_engagement_summary", {
        p_org_id: activeOrgId,
        p_user_ids: userIds,
        p_since: since.toISOString(),
      });

      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId && !!userIds && userIds.length > 0,
  });

  const engagementData = engagementQuery.data || [];

  const totals = useMemo(() => {
    const result = {
      meetings: 0,
      calls: 0,
      emails: 0,
      tasks: 0,
      documents_shared: 0,
      share_link_views: 0,
    };
    for (const entry of engagementData) {
      result.meetings += entry.meetings || 0;
      result.calls += entry.calls || 0;
      result.emails += entry.emails || 0;
      result.tasks += entry.tasks || 0;
      result.documents_shared += entry.documents_shared || 0;
      result.share_link_views += entry.share_link_views || 0;
    }
    return result;
  }, [engagementData]);

  return {
    engagementData,
    loading: engagementQuery.isLoading,
    error: engagementQuery.error?.message || null,
    totals,
    refetch: engagementQuery.refetch,
  };
}
