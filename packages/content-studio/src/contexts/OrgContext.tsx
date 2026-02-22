import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "cirrus_ops_active_org_id";
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  [key: string]: any;
}

interface OrgContextValue {
  orgs: OrgInfo[];
  activeOrg: OrgInfo | null;
  activeOrgId: string | null;
  loading: boolean;
  error: string | null;
  switchOrg: (orgId: string) => void;
  createOrg: (opts: { name: string; slug: string }) => Promise<any>;
  updateOrg: (orgId: string, updates: Record<string, any>) => Promise<any>;
  loadMembers: (orgId: string) => Promise<any[]>;
  addMember: (orgId: string, email: string, role: string) => Promise<any>;
  updateMemberRole: (memberId: string, role: string) => Promise<void>;
  updateMemberReportsTo: (
    memberId: string,
    reportsToUserId: string | null,
  ) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  hasRole: (minRole: string) => boolean;
  getIntegrations: (orgId: string) => Promise<any[]>;
  saveIntegration: (opts: {
    orgId: string;
    provider: string;
    environment: string;
    credentials: any;
  }) => Promise<any>;
  deleteIntegration: (integrationId: string) => Promise<void>;
  reloadOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  activeOrg: null,
  activeOrgId: null,
  loading: true,
  error: null,
  switchOrg: () => {},
  createOrg: async () => null,
  updateOrg: async () => null,
  loadMembers: async () => [],
  addMember: async () => null,
  updateMemberRole: async () => {},
  updateMemberReportsTo: async () => {},
  removeMember: async () => {},
  hasRole: () => false,
  getIntegrations: async () => [],
  saveIntegration: async () => null,
  deleteIntegration: async () => {},
  reloadOrgs: async () => {},
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [activeOrg, setActiveOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    const supabase = getSupabase();
    try {
      let orgList: OrgInfo[] = [];
      const userId = session?.user?.id || null;

      if (userId && userId !== "dev-local-user") {
        const { data, error: rpcError } = await supabase.rpc("get_user_orgs", {
          p_user_id: userId,
        });
        if (rpcError) throw rpcError;
        orgList = data || [];
      } else if (DEV_BYPASS) {
        const { data, error: rpcError } = await supabase.rpc(
          "get_all_orgs_dev",
        );
        if (!rpcError && data) {
          orgList = data.map((o: any) => ({ ...o, role: "owner" }));
        }
      }

      setOrgs(orgList);

      // Restore saved org or pick first
      const savedId = localStorage.getItem(STORAGE_KEY);
      const savedOrg = savedId
        ? orgList.find((o) => o.id === savedId)
        : null;
      if (savedOrg) {
        setActiveOrg(savedOrg);
      } else if (orgList.length > 0) {
        setActiveOrg(orgList[0]);
        localStorage.setItem(STORAGE_KEY, orgList[0].id);
      } else {
        setActiveOrg(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (user) {
      loadOrgs();
    } else {
      setOrgs([]);
      setActiveOrg(null);
      setLoading(false);
    }
  }, [user, loadOrgs]);

  const switchOrg = useCallback(
    (orgId: string) => {
      const org = orgs.find((o) => o.id === orgId);
      if (org) {
        setActiveOrg(org);
        localStorage.setItem(STORAGE_KEY, orgId);
      }
    },
    [orgs],
  );

  const createOrg = useCallback(
    async (opts: { name: string; slug: string }) => {
      const supabase = getSupabase();
      setError(null);
      try {
        const userId = session?.user?.id || null;
        const { data: org, error: createError } = await supabase.rpc(
          "create_org_with_owner",
          {
            org_name: opts.name,
            org_slug: opts.slug,
            owner_user_id: userId,
          },
        );
        if (createError) throw createError;
        await loadOrgs();
        switchOrg(org.id);
        return org;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    },
    [session, loadOrgs, switchOrg],
  );

  const updateOrg = useCallback(
    async (orgId: string, updates: Record<string, any>) => {
      const supabase = getSupabase();
      setError(null);
      try {
        const { data, error: updateError } = await supabase
          .from("organizations")
          .update(updates)
          .eq("id", orgId)
          .select()
          .single();
        if (updateError) throw updateError;
        await loadOrgs();
        return data;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    },
    [loadOrgs],
  );

  const loadMembers = useCallback(async (orgId: string) => {
    const supabase = getSupabase();
    try {
      const { data, error: fetchError } = await supabase
        .from("org_members")
        .select(
          "id, user_id, role, display_name, email, reports_to, created_at",
        )
        .eq("org_id", orgId)
        .order("created_at");
      if (fetchError) throw fetchError;
      return data || [];
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }, []);

  const addMember = useCallback(
    async (orgId: string, email: string, role: string) => {
      const supabase = getSupabase();
      setError(null);
      try {
        const { data, error: insertError } = await supabase
          .from("org_members")
          .insert({ org_id: orgId, user_id: email, role })
          .select()
          .single();
        if (insertError) throw insertError;
        return data;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    },
    [],
  );

  const updateMemberRole = useCallback(
    async (memberId: string, role: string) => {
      const supabase = getSupabase();
      setError(null);
      try {
        const { error: updateError } = await supabase
          .from("org_members")
          .update({ role })
          .eq("id", memberId);
        if (updateError) throw updateError;
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [],
  );

  const updateMemberReportsTo = useCallback(
    async (memberId: string, reportsToUserId: string | null) => {
      const supabase = getSupabase();
      setError(null);
      try {
        const { error: updateError } = await supabase
          .from("org_members")
          .update({ reports_to: reportsToUserId || null })
          .eq("id", memberId);
        if (updateError) throw updateError;
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [],
  );

  const removeMember = useCallback(async (memberId: string) => {
    const supabase = getSupabase();
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("org_members")
        .delete()
        .eq("id", memberId);
      if (deleteError) throw deleteError;
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const hasRole = useCallback(
    (minRole: string) => {
      const hierarchy: Record<string, number> = {
        owner: 4,
        admin: 3,
        manager: 2,
        member: 1,
      };
      const userRole = activeOrg?.role;
      if (!userRole) return false;
      return (hierarchy[userRole] || 0) >= (hierarchy[minRole] || 0);
    },
    [activeOrg],
  );

  const getIntegrations = useCallback(async (orgId: string) => {
    const supabase = getSupabase();
    try {
      const { data, error: fetchError } = await supabase
        .from("integrations")
        .select("*")
        .eq("org_id", orgId)
        .order("provider");
      if (fetchError) throw fetchError;
      return data || [];
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }, []);

  const saveIntegration = useCallback(
    async (opts: {
      orgId: string;
      provider: string;
      environment: string;
      credentials: any;
    }) => {
      const supabase = getSupabase();
      setError(null);
      try {
        const { data, error: upsertError } = await supabase
          .from("integrations")
          .upsert(
            {
              org_id: opts.orgId,
              provider: opts.provider,
              environment: opts.environment,
              credentials: opts.credentials,
              is_active: true,
            },
            {
              onConflict: "org_id,provider,environment",
              ignoreDuplicates: false,
            },
          )
          .select()
          .single();

        if (upsertError) {
          // Fallback: try find-then-update/insert
          const { data: existing } = await supabase
            .from("integrations")
            .select("id")
            .eq("org_id", opts.orgId)
            .eq("provider", opts.provider)
            .eq("environment", opts.environment)
            .maybeSingle();

          if (existing) {
            const { data: updated, error: updateError } = await supabase
              .from("integrations")
              .update({ credentials: opts.credentials, is_active: true })
              .eq("id", existing.id)
              .select()
              .single();
            if (updateError) throw updateError;
            return updated;
          }

          const { data: inserted, error: insertError } = await supabase
            .from("integrations")
            .insert({
              org_id: opts.orgId,
              provider: opts.provider,
              environment: opts.environment,
              credentials: opts.credentials,
              is_active: true,
            })
            .select()
            .single();
          if (insertError) throw insertError;
          return inserted;
        }

        return data;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    },
    [],
  );

  const deleteIntegration = useCallback(async (integrationId: string) => {
    const supabase = getSupabase();
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("integrations")
        .delete()
        .eq("id", integrationId);
      if (deleteError) throw deleteError;
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  return (
    <OrgContext.Provider
      value={{
        orgs,
        activeOrg,
        activeOrgId: activeOrg?.id ?? null,
        loading,
        error,
        switchOrg,
        createOrg,
        updateOrg,
        loadMembers,
        addMember,
        updateMemberRole,
        updateMemberReportsTo,
        removeMember,
        hasRole,
        getIntegrations,
        saveIntegration,
        deleteIntegration,
        reloadOrgs: loadOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
