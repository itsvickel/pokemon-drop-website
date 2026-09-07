import { useCallback, useEffect, useState } from "react";
import {
  addSaved, forGame, parseSaved, removeSaved, type SavedSearch,
} from "../lib/savedSearches";

/**
 * Named filter states, saved locally.
 *
 * The listing page already serialises every filter into the URL, so a saved
 * search is really a named URL. The value is not storage — the browser has
 * bookmarks — it is that these live beside the filters, so "Japanese sealed
 * under $40" is one click away instead of eight.
 *
 * Deliberately localStorage rather than an account: nothing here is worth
 * asking someone to sign in for, and a search that only works when logged in is
 * a search most people will not save.
 */

const STORAGE_KEY = "tcgdrop.saved_searches.v1";

function write(items: SavedSearch[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private mode or a full quota — saving fails quietly rather than throwing.
  }
}

export type SavedSearches = {
  hydrated: boolean;
  items: SavedSearch[];
  forGame: (tcg: string) => SavedSearch[];
  save: (name: string, href: string, tcg: string) => void;
  remove: (id: string) => void;
  /** True when this exact href is already saved, so the UI can say so. */
  has: (href: string) => boolean;
};

export function useSavedSearches(): SavedSearches {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount, so the server and first client render agree.
  useEffect(() => {
    try {
      setItems(parseSaved(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      // Storage can be blocked outright; an empty list is the right fallback.
    }
    setHydrated(true);
  }, []);

  const save = useCallback((name: string, href: string, tcg: string) => {
    setItems((prev) => {
      const next = addSaved(prev, {
        name, href, tcg,
        // Unique per save without needing a crypto dependency; two saves in the
        // same millisecond would have to share an href, which addSaved dedupes.
        id: `${Date.now()}-${href}`,
        createdAt: new Date().toISOString(),
      });
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = removeSaved(prev, id);
      write(next);
      return next;
    });
  }, []);

  return {
    hydrated,
    items,
    forGame: useCallback((tcg: string) => forGame(items, tcg), [items]),
    save,
    remove,
    has: useCallback((href: string) => items.some((s) => s.href === href), [items]),
  };
}
