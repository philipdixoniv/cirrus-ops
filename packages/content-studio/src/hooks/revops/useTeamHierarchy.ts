import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

type Scope = "mine" | "team" | "all";

interface TeamHierarchyState {
  scope: Scope;
  setScope: (scope: Scope) => void;
  filterOwnerIds: string[] | null;
  teamMembers: any[];
  teamSubtreeIds: string[];
  hasDirectReports: boolean;
  getOwnerName: (ownerId: string | null) => string;
  getDirectReports: (userId: string) => any[];
  buildHierarchyTree: () => { roots: any[]; unassigned: any[] };
  loading: boolean;
}

export function useTeamHierarchy(): TeamHierarchyState {
  const { activeOrgId, hasRole } = useOrg();
  const [scope, setScope] = useState<Scope>("mine");

  const membersQuery = useQuery({
    queryKey: ["teamMembers", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("org_members")
        .select("id, user_id, role, display_name, email, reports_to, created_at")
        .eq("org_id", activeOrgId)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const subtreeQuery = useQuery({
    queryKey: ["teamSubtree", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase.rpc("get_team_subtree", {
        p_org_id: activeOrgId,
        p_user_id: userId,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const teamMembers = membersQuery.data || [];
  const teamSubtreeIds = subtreeQuery.data || [];

  const filterOwnerIds = useMemo(() => {
    if (scope === "all") return null;
    if (scope === "team") return teamSubtreeIds.length > 0 ? teamSubtreeIds : null;
    // 'mine'
    return teamSubtreeIds.length > 0 ? [teamSubtreeIds[0]] : null;
  }, [scope, teamSubtreeIds]);

  const hasDirectReports = teamSubtreeIds.length > 1;

  const getOwnerName = useCallback(
    (ownerId: string | null) => {
      if (!ownerId) return "Unassigned";
      const member = teamMembers.find((m: any) => m.user_id === ownerId);
      return member?.display_name || "Unknown";
    },
    [teamMembers],
  );

  const getDirectReports = useCallback(
    (userId: string) => teamMembers.filter((m: any) => m.reports_to === userId),
    [teamMembers],
  );

  const buildHierarchyTree = useCallback(() => {
    const roots: any[] = [];
    const unassigned: any[] = [];

    for (const member of teamMembers) {
      if (!member.reports_to) {
        const hasReports = teamMembers.some((m: any) => m.reports_to === member.user_id);
        if (hasReports || member.role === "owner" || member.role === "admin") {
          roots.push(member);
        } else {
          unassigned.push(member);
        }
      }
    }

    return { roots, unassigned };
  }, [teamMembers]);

  return {
    scope,
    setScope,
    filterOwnerIds,
    teamMembers,
    teamSubtreeIds,
    hasDirectReports,
    getOwnerName,
    getDirectReports,
    buildHierarchyTree,
    loading: membersQuery.isLoading || subtreeQuery.isLoading,
  };
}
