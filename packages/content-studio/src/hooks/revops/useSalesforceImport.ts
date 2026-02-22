import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useSalesforceImport() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const importsQuery = useQuery({
    queryKey: ["salesforceImports", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("salesforce_imports")
        .select("*")
        .eq("org_id", activeOrgId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const imports = importsQuery.data || [];

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["salesforceImports", activeOrgId],
      }),
    [queryClient, activeOrgId],
  );

  const triggerImport = useCallback(
    async (opts?: {
      objectTypes?: string[];
      mode?: string;
      sinceDate?: string;
    }) => {
      if (!activeOrgId)
        throw new Error("No organization selected");
      const supabase = getSupabase();

      const { data, error } = await supabase.functions.invoke(
        "salesforce-import",
        {
          body: {
            org_id: activeOrgId,
            object_types: opts?.objectTypes || [
              "Account",
              "Contact",
              "Opportunity",
            ],
            mode: opts?.mode || "incremental",
            since_date: opts?.sinceDate || null,
          },
        },
      );
      if (error) throw new Error(error.message || "Import trigger failed");
      if (data?.error) throw new Error(data.error);
      invalidate();
      return data;
    },
    [activeOrgId, invalidate],
  );

  const getImports = useCallback(
    async (opts?: { limit?: number; status?: string }) => {
      if (!activeOrgId) return [];
      const supabase = getSupabase();

      let query = supabase
        .from("salesforce_imports")
        .select("*")
        .eq("org_id", activeOrgId)
        .order("created_at", { ascending: false });

      if (opts?.status) {
        query = query.eq("status", opts.status);
      }
      if (opts?.limit) {
        query = query.limit(opts.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    [activeOrgId],
  );

  const pollImportStatus = useCallback(
    async (importId: string): Promise<any> => {
      const supabase = getSupabase();
      const maxAttempts = 60;
      const intervalMs = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { data, error } = await supabase
          .from("salesforce_imports")
          .select("*")
          .eq("id", importId)
          .single();

        if (error) throw error;
        if (!data) throw new Error("Import not found");

        if (data.status === "completed" || data.status === "failed") {
          invalidate();
          return data;
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      throw new Error("Import polling timed out");
    },
    [invalidate],
  );

  return {
    imports,
    loading: importsQuery.isLoading,
    error: importsQuery.error?.message || null,
    triggerImport,
    getImports,
    pollImportStatus,
    refetch: importsQuery.refetch,
  };
}
