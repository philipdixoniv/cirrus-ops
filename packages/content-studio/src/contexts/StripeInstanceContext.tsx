import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useOrg } from "./OrgContext";

interface StripeInstanceContextValue {
  instances: any[];
  activeInstanceId: string | null;
  activeInstance: any | null;
  loading: boolean;
  error: string | null;
  switchInstance: (id: string) => void;
  createInstance: (opts: { name?: string; credentials: any }) => Promise<any>;
  updateInstance: (id: string, updates: any) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  getInstanceName: (id: string) => string | null;
  fetchStripeAccountInfo: (credentials: any) => Promise<any>;
}

const StripeInstanceContext = createContext<StripeInstanceContextValue>(null!);

export function StripeInstanceProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);

  const instancesQuery = useQuery({
    queryKey: ["stripeInstances", activeOrgId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("stripe_instances")
        .select("*")
        .eq("org_id", activeOrgId)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const instances = instancesQuery.data || [];

  // Auto-select first instance when current selection is invalid
  if (
    instances.length > 0 &&
    !instances.find((i: any) => i.id === activeInstanceId)
  ) {
    if (activeInstanceId !== instances[0].id) {
      setTimeout(() => setActiveInstanceId(instances[0].id), 0);
    }
  }

  const activeInstance =
    instances.find((i: any) => i.id === activeInstanceId) || null;

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["stripeInstances", activeOrgId],
      }),
    [queryClient, activeOrgId],
  );

  const switchInstance = useCallback((id: string) => {
    setActiveInstanceId(id);
  }, []);

  const validateStripeKey = useCallback(async (credentials: any) => {
    const supabase = getSupabase();
    const key = credentials?.api_key || credentials?.secret_key;
    if (!key) throw new Error("A Stripe API key is required");

    const { data, error } = await supabase.functions.invoke(
      "stripe-validate-key",
      { body: { api_key: key } },
    );
    if (error) throw new Error(error.message || "Stripe key validation failed");
    if (data?.error) throw new Error(data.error);

    return {
      id: data.id,
      displayName: data.displayName || null,
      email: data.email || null,
    };
  }, []);

  const createInstance = useCallback(
    async (opts: { name?: string; credentials: any }) => {
      if (!activeOrgId) throw new Error("No organization selected");
      const supabase = getSupabase();
      const key = opts.credentials?.api_key || opts.credentials?.secret_key;
      const accountInfo = await validateStripeKey(opts.credentials);

      const isTestKey =
        key?.startsWith("sk_test_") || key?.startsWith("rk_test_");
      const mode = isTestKey ? "Test" : "Live";
      const derivedName =
        opts.name || `${accountInfo.displayName || "Stripe"} (${mode})`;

      const { data, error } = await supabase
        .from("stripe_instances")
        .insert({
          org_id: activeOrgId,
          name: derivedName,
          credentials: opts.credentials,
          stripe_account_id: accountInfo.id,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      return data;
    },
    [activeOrgId, validateStripeKey, invalidate],
  );

  const updateInstance = useCallback(
    async (id: string, updates: any) => {
      const supabase = getSupabase();
      if (updates.credentials) {
        try {
          const info = await validateStripeKey(updates.credentials);
          if (info) updates.stripe_account_id = info.id;
        } catch {
          // Proceed with update even if validation fails
        }
      }
      const { error } = await supabase
        .from("stripe_instances")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [validateStripeKey, invalidate],
  );

  const deleteInstance = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("stripe_instances")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const getInstanceName = useCallback(
    (id: string) => {
      const inst = instances.find((i: any) => i.id === id);
      return inst ? inst.name : null;
    },
    [instances],
  );

  const fetchStripeAccountInfo = useCallback(
    async (credentials: any) => {
      try {
        return await validateStripeKey(credentials);
      } catch {
        return null;
      }
    },
    [validateStripeKey],
  );

  return (
    <StripeInstanceContext.Provider
      value={{
        instances,
        activeInstanceId,
        activeInstance,
        loading: instancesQuery.isLoading,
        error: instancesQuery.error?.message || null,
        switchInstance,
        createInstance,
        updateInstance,
        deleteInstance,
        getInstanceName,
        fetchStripeAccountInfo,
      }}
    >
      {children}
    </StripeInstanceContext.Provider>
  );
}

export function useStripeInstances() {
  return useContext(StripeInstanceContext);
}
