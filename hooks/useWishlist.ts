import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "../lib/supabaseBrowser";

const STORAGE_KEY = "ptcg-wishlist-v1";

// Cloud merge runs once per page load per user (module-level guard so the
// many useWishlist() instances don't repeat it).
let cloudSyncedFor: string | null = null;

export type WishlistReturn = {
  has: (key: string) => boolean;
  toggle: (key: string) => void;
  add: (key: string) => void;
  count: number;
  items: string[];
  hydrated: boolean;
};

function writeLocal(keys: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {}
}

/** Fire-and-forget write-through to Supabase when signed in. */
function cloudWrite(key: string, present: boolean): void {
  const supabase = getBrowserSupabase();
  if (!supabase) return;
  void supabase.auth.getSession().then(({ data }) => {
    const user = data.session?.user;
    if (!user) return;
    if (present) {
      void supabase.from("user_wishlists").upsert({ user_id: user.id, group_key: key });
    } else {
      void supabase.from("user_wishlists").delete().eq("user_id", user.id).eq("group_key", key);
    }
  });
}

export function useWishlist(): WishlistReturn {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setKeys(new Set(JSON.parse(raw) as string[]));
    } catch {}
    setHydrated(true);
  }, []);

  // ── Cloud merge on sign-in: union of local + remote, push local-only up ──
  useEffect(() => {
    if (!hydrated) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;

    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user || cancelled || cloudSyncedFor === user.id) return;
      cloudSyncedFor = user.id;

      const { data: rows, error } = await supabase
        .from("user_wishlists")
        .select("group_key");
      if (error || cancelled) {
        if (error) cloudSyncedFor = null; // retry on next mount
        return;
      }

      const remote = new Set((rows ?? []).map((r) => r.group_key as string));
      let local: Set<string> = new Set();
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) local = new Set(JSON.parse(raw) as string[]);
      } catch {}

      const localOnly = [...local].filter((k) => !remote.has(k));
      if (localOnly.length > 0) {
        await supabase
          .from("user_wishlists")
          .upsert(localOnly.map((k) => ({ user_id: user.id, group_key: k })));
      }

      const merged = new Set([...local, ...remote]);
      if (!cancelled) {
        setKeys(merged);
        writeLocal(merged);
      }
    });

    return () => { cancelled = true; };
  }, [hydrated]);

  const toggle = useCallback((key: string) => {
    setKeys((prev) => {
      const next = new Set(prev);
      const adding = !next.has(key);
      if (adding) next.add(key);
      else next.delete(key);
      writeLocal(next);
      cloudWrite(key, adding);
      return next;
    });
  }, []);

  const has = useCallback((key: string) => keys.has(key), [keys]);

  const add = useCallback((key: string) => {
    setKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      writeLocal(next);
      cloudWrite(key, true);
      return next;
    });
  }, []);

  return { has, toggle, add, items: [...keys], count: keys.size, hydrated };
}
