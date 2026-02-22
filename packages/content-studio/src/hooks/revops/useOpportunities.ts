import { useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useOpportunities() {
  const { activeOrgId } = useOrg();

  const getOpportunities = useCallback(
    async (opts?: { ownerIds?: string[] }) => {
      if (!activeOrgId) return [];
      const supabase = getSupabase();

      let query = supabase
        .from("opportunities")
        .select(`
          id, name, amount, stage, owner_id, updated_at, created_at,
          accounts ( id, name ),
          contacts ( id, first_name, last_name, email )
        `)
        .eq("org_id", activeOrgId)
        .order("updated_at", { ascending: false });

      if (opts?.ownerIds) {
        query = query.in("owner_id", opts.ownerIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    [activeOrgId],
  );

  const getOpportunity = useCallback(async (id: string) => {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("opportunities")
      .select(`
        id, name, amount, stage, updated_at, created_at,
        accounts ( id, name ),
        contacts ( id, first_name, last_name, title, email ),
        quotes (
          id, status, term_length, billing_frequency, seat_count,
          mrr, arr, tcv, is_primary, version_number, record_type,
          created_at, updated_at
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    if (data.quotes) {
      data.quotes.sort((a: any, b: any) => b.version_number - a.version_number);
    }

    return data;
  }, []);

  const createOpportunity = useCallback(
    async (params: { accountId: string; contactId: string; name: string }) => {
      if (!activeOrgId) throw new Error("No active organization");
      const supabase = getSupabase();

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          account_id: params.accountId,
          contact_id: params.contactId,
          name: params.name,
          stage: "prospecting",
          amount: 0,
          created_by: userId,
          owner_id: userId,
          org_id: activeOrgId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [activeOrgId],
  );

  const updateOpportunityAmount = useCallback(async (opportunityId: string, amount: number) => {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("opportunities")
      .update({ amount })
      .eq("id", opportunityId);
    if (error) throw error;
  }, []);

  const updateOpportunityStage = useCallback(async (opportunityId: string, stage: string) => {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("opportunities")
      .update({ stage })
      .eq("id", opportunityId);
    if (error) throw error;
  }, []);

  return {
    getOpportunities,
    getOpportunity,
    createOpportunity,
    updateOpportunityAmount,
    updateOpportunityStage,
  };
}
