import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useSSO() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const domainsQuery = useQuery({
    queryKey: ["ssoDomains", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("sso_domains")
        .select("*")
        .eq("org_id", activeOrgId)
        .order("domain");
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const domains = domainsQuery.data || [];

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["ssoDomains", activeOrgId],
      }),
    [queryClient, activeOrgId],
  );

  const loadDomains = useCallback(async () => {
    // Domains are already loaded via React Query; force refetch
    invalidate();
    return domains;
  }, [invalidate, domains]);

  const addDomain = useCallback(
    async (opts: {
      domain: string;
      provider: string;
      metadata_url?: string;
      client_id?: string;
      client_secret?: string;
      auto_provision?: boolean;
    }) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("sso_domains")
        .insert({
          org_id: activeOrgId,
          domain: opts.domain,
          provider: opts.provider,
          metadata_url: opts.metadata_url || null,
          client_id: opts.client_id || null,
          client_secret: opts.client_secret || null,
          auto_provision: opts.auto_provision ?? false,
          is_active: true,
          verified: false,
        })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return data;
    },
    [activeOrgId, invalidate],
  );

  const updateDomain = useCallback(
    async (domainId: string, updates: any) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("sso_domains")
        .update(updates)
        .eq("id", domainId);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const removeDomain = useCallback(
    async (domainId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("sso_domains")
        .delete()
        .eq("id", domainId);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  return {
    domains,
    loading: domainsQuery.isLoading,
    error: domainsQuery.error?.message || null,
    loadDomains,
    addDomain,
    updateDomain,
    removeDomain,
    refetch: domainsQuery.refetch,
  };
}
