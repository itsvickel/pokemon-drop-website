import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "../lib/supabaseBrowser";
import { useAuth } from "./useAuth";
import type { Holding } from "../lib/collection";

/**
 * The signed-in user's collection.
 *
 * Talks to Supabase directly rather than through an API route: user_collection
 * has row-level security keyed on auth.uid(), so the database itself enforces
 * that a user only ever sees their own rows. A server route in between would add
 * a second place for that rule to be wrong.
 */

const TABLE = "user_collection";

export type CollectionState = {
  enabled: boolean;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  holdings: Holding[];
  add: (h: Omit<Holding, "id">) => Promise<string | null>;
  update: (groupKey: string, patch: Partial<Holding>) => Promise<string | null>;
  remove: (groupKey: string) => Promise<string | null>;
  refresh: () => Promise<void>;
};

export function useCollection(): CollectionState {
  const auth = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (!supabase || !auth.user) {
      setHoldings([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from(TABLE)
      .select("id, group_key, product_name, tcg, quantity, unit_cost, purchased_at, notes")
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setHoldings((data ?? []) as Holding[]);
    setLoading(false);
  }, [auth.user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const add = useCallback(async (h: Omit<Holding, "id">): Promise<string | null> => {
    const supabase = getBrowserSupabase();
    if (!supabase || !auth.user) return "Sign in to track your collection.";
    // One row per product; adding something already held bumps the quantity
    // rather than creating a duplicate line.
    const existing = holdings.find((x) => x.group_key === h.group_key);
    const payload = existing
      ? { quantity: existing.quantity + h.quantity }
      : { ...h, user_id: auth.user.id };
    const { error: err } = existing
      ? await supabase.from(TABLE).update(payload).eq("group_key", h.group_key)
      : await supabase.from(TABLE).insert(payload);
    if (err) return err.message;
    await refresh();
    return null;
  }, [auth.user, holdings, refresh]);

  const update = useCallback(async (groupKey: string, patch: Partial<Holding>): Promise<string | null> => {
    const supabase = getBrowserSupabase();
    if (!supabase || !auth.user) return "Sign in to track your collection.";
    const { error: err } = await supabase.from(TABLE).update(patch).eq("group_key", groupKey);
    if (err) return err.message;
    await refresh();
    return null;
  }, [auth.user, refresh]);

  const remove = useCallback(async (groupKey: string): Promise<string | null> => {
    const supabase = getBrowserSupabase();
    if (!supabase || !auth.user) return "Sign in to track your collection.";
    const { error: err } = await supabase.from(TABLE).delete().eq("group_key", groupKey);
    if (err) return err.message;
    await refresh();
    return null;
  }, [auth.user, refresh]);

  return {
    enabled: auth.enabled,
    signedIn: !!auth.user,
    loading: loading || auth.loading,
    error,
    holdings,
    add,
    update,
    remove,
    refresh,
  };
}
