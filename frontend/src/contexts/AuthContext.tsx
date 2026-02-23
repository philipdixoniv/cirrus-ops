import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface Org {
  id: string;
  name: string;
  role: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  orgs: Org[];
  activeOrg: Org | null;
  setActiveOrg: (org: Org) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  orgs: [],
  activeOrg: null,
  setActiveOrg: () => {},
  signIn: async () => {},
  signOut: async () => {},
  isLoading: true,
});

const ORG_STORAGE_KEY = "activeOrgId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrgState] = useState<Org | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrgs = useCallback(async (accessToken: string): Promise<Org[]> => {
    try {
      const res = await fetch("/api/auth/orgs", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return [];
      return (await res.json()) as Org[];
    } catch {
      return [];
    }
  }, []);

  const createDefaultOrg = useCallback(
    async (accessToken: string, email: string): Promise<Org[]> => {
      try {
        const orgName = email.split("@")[1]?.split(".")[0] || "My Organization";
        const res = await fetch("/api/auth/orgs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ name: orgName }),
        });
        if (!res.ok) return [];
        const org = (await res.json()) as Org;
        return [org];
      } catch {
        return [];
      }
    },
    []
  );

  const restoreActiveOrg = useCallback((orgList: Org[]) => {
    if (orgList.length === 0) {
      setActiveOrgState(null);
      return;
    }
    const savedId = localStorage.getItem(ORG_STORAGE_KEY);
    const found = savedId ? orgList.find((o) => o.id === savedId) : null;
    const selected = found || orgList[0];
    setActiveOrgState(selected);
    localStorage.setItem(ORG_STORAGE_KEY, selected.id);
  }, []);

  const handleSession = useCallback(
    async (newSession: Session | null) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (!newSession) {
        setOrgs([]);
        setActiveOrgState(null);
        setIsLoading(false);
        return;
      }

      let orgList = await fetchOrgs(newSession.access_token);
      if (orgList.length === 0 && newSession.user.email) {
        orgList = await createDefaultOrg(
          newSession.access_token,
          newSession.user.email
        );
      }
      setOrgs(orgList);
      restoreActiveOrg(orgList);
      setIsLoading(false);
    },
    [fetchOrgs, createDefaultOrg, restoreActiveOrg]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      handleSession(s);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      handleSession(s);
    });

    return () => subscription.unsubscribe();
  }, [handleSession]);

  const setActiveOrg = (org: Org) => {
    setActiveOrgState(org);
    localStorage.setItem(ORG_STORAGE_KEY, org.id);
  };

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setOrgs([]);
    setActiveOrgState(null);
    localStorage.removeItem(ORG_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        orgs,
        activeOrg,
        setActiveOrg,
        signIn,
        signOut,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
