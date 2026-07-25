import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "../lib/supabaseBrowser";

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthReturn = {
  /** false when Supabase env vars are absent — hide all account UI */
  enabled: boolean;
  user: AuthUser | null;
  loading: boolean;
  /** Sends a magic link. Resolves to an error message or null on success. */
  signIn: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

export function useAuth(): AuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setEnabled(true);

    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u?.email ? { id: u.id, email: u.email } : null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u?.email ? { id: u.id, email: u.email } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string): Promise<string | null> => {
    const supabase = getBrowserSupabase();
    if (!supabase) return "Accounts are not configured.";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/account` },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { enabled, user, loading, signIn, signOut };
}
