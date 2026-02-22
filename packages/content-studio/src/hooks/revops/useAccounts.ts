import { useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "@/contexts/OrgContext";

export function useAccounts() {
  const { activeOrgId } = useOrg();

  const findOrCreateAccount = useCallback(
    async (name: string) => {
      if (!activeOrgId) throw new Error("No active organization");
      const supabase = getSupabase();

      const { data: existing } = await supabase
        .from("accounts")
        .select("id, name")
        .eq("org_id", activeOrgId)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();

      if (existing) return existing;

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data, error } = await supabase
        .from("accounts")
        .insert({ name, created_by: userId, owner_id: userId, org_id: activeOrgId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [activeOrgId],
  );

  const findOrCreateContact = useCallback(
    async (params: {
      accountId: string;
      firstName: string;
      lastName: string;
      title?: string;
      email?: string;
    }) => {
      if (!activeOrgId) throw new Error("No active organization");
      const supabase = getSupabase();

      if (params.email) {
        const { data: existing } = await supabase
          .from("contacts")
          .select("*")
          .eq("org_id", activeOrgId)
          .eq("account_id", params.accountId)
          .ilike("email", params.email)
          .limit(1)
          .maybeSingle();

        if (existing) return existing;
      }

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data, error } = await supabase
        .from("contacts")
        .insert({
          account_id: params.accountId,
          first_name: params.firstName || "",
          last_name: params.lastName || "",
          title: params.title,
          email: params.email,
          created_by: userId,
          org_id: activeOrgId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    [activeOrgId],
  );

  const searchAccounts = useCallback(
    async (query: string) => {
      if (!activeOrgId) return [];
      const supabase = getSupabase();

      const { data } = await supabase
        .from("accounts")
        .select("id, name")
        .eq("org_id", activeOrgId)
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(10);

      return data || [];
    },
    [activeOrgId],
  );

  const getContactsForAccount = useCallback(
    async (accountId: string) => {
      if (!activeOrgId || !accountId) return [];
      const supabase = getSupabase();

      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("org_id", activeOrgId)
        .eq("account_id", accountId)
        .order("created_at");

      return data || [];
    },
    [activeOrgId],
  );

  const getAccount = useCallback(
    async (accountId: string) => {
      if (!activeOrgId || !accountId) return null;
      const supabase = getSupabase();

      const { data } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", accountId)
        .eq("org_id", activeOrgId)
        .single();

      return data;
    },
    [activeOrgId],
  );

  const getAccountWithRelations = useCallback(
    async (accountId: string) => {
      if (!activeOrgId || !accountId) return null;
      const supabase = getSupabase();

      const { data } = await supabase
        .from("accounts")
        .select(`
          *,
          contacts ( * ),
          opportunities (
            *,
            quotes ( id, status, mrr, arr, tcv, is_primary, version_number, created_at )
          )
        `)
        .eq("id", accountId)
        .eq("org_id", activeOrgId)
        .single();

      return data;
    },
    [activeOrgId],
  );

  const linkStripeCustomer = useCallback(
    async (accountId: string, stripeCustomerId: string, mode: string) => {
      const supabase = getSupabase();
      const field = mode === "live" ? "stripe_customer_id_prod" : "stripe_customer_id_sandbox";
      await supabase.from("accounts").update({ [field]: stripeCustomerId }).eq("id", accountId);
    },
    [],
  );

  return {
    findOrCreateAccount,
    findOrCreateContact,
    searchAccounts,
    getContactsForAccount,
    getAccount,
    getAccountWithRelations,
    linkStripeCustomer,
  };
}
