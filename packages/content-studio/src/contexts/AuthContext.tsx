import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

const DEV_USER = {
  id: "dev-local-user",
  email: "dev@localhost",
  app_metadata: { provider: "dev" },
  user_metadata: { full_name: "Dev User" },
} as unknown as User;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  devBypass: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithSSO: (opts: {
    providerId?: string;
    domain?: string;
  }) => Promise<void>;
  checkSSOForEmail: (email: string) => Promise<any | null>;
  signOut: () => Promise<void>;
  devSignIn: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  devBypass: DEV_BYPASS,
  signInWithGoogle: async () => {},
  signInWithMicrosoft: async () => {},
  signInWithSSO: async () => {},
  checkSSOForEmail: async () => null,
  signOut: async () => {},
  devSignIn: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    if (DEV_BYPASS) {
      setUser(DEV_USER);
      setSession({ user: DEV_USER } as unknown as Session);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function init() {
      const hasHashTokens = window.location.hash.includes("access_token=");

      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
        }
      } catch {
        if (mounted) {
          setSession(null);
          setUser(null);
        }
      }

      // If hash tokens present but no session yet, wait for Supabase to process
      if (hasHashTokens) {
        await new Promise<void>((resolve) => {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (event === "SIGNED_IN" && newSession && mounted) {
              setSession(newSession);
              setUser(newSession.user ?? null);
              subscription.unsubscribe();
              resolve();
            }
          });
          setTimeout(() => {
            subscription.unsubscribe();
            resolve();
          }, 5000);
        });
        if (window.location.hash) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      }

      if (mounted) setLoading(false);
    }

    init();

    // Listen for future auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: window.location.origin,
        scopes: "email profile openid",
      },
    });
    if (error) throw error;
  }, []);

  const signInWithSSO = useCallback(
    async (opts: { providerId?: string; domain?: string }) => {
      const params: any = {};
      if (opts.providerId) params.providerId = opts.providerId;
      if (opts.domain) params.domain = opts.domain;
      const { data, error } = await getSupabase().auth.signInWithSSO({
        ...params,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    },
    [],
  );

  const checkSSOForEmail = useCallback(async (email: string) => {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return null;
    const { data, error } = await getSupabase().rpc("get_sso_for_domain", {
      p_domain: domain,
    });
    if (error || !data || data.length === 0) return null;
    return data[0];
  }, []);

  const signOut = useCallback(async () => {
    if (!DEV_BYPASS) {
      await getSupabase().auth.signOut();
    }
    setSession(null);
    setUser(null);
    localStorage.removeItem("cirrus_ops_active_org_id");
  }, []);

  const devSignIn = useCallback(() => {
    setUser(DEV_USER);
    setSession({ user: DEV_USER } as unknown as Session);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        devBypass: DEV_BYPASS,
        signInWithGoogle,
        signInWithMicrosoft,
        signInWithSSO,
        checkSSOForEmail,
        signOut,
        devSignIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
