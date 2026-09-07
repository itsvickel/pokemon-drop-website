/**
 * Saved-search list arithmetic, kept out of the hook so it can be tested
 * without a DOM. The hook owns storage and React state; everything that has a
 * right answer lives here.
 */

/** Enough to be useful; past this the list stops being scannable. */
export const MAX_SAVED = 12;
/** Long enough to describe a search, short enough to stay on one line. */
export const MAX_NAME_LENGTH = 40;

export type SavedSearch = {
  id: string;
  name: string;
  /** The listing path plus its query string, e.g. "/mtg/sealed?lang=Japanese". */
  href: string;
  tcg: string;
  createdAt: string;
};

/** Storage is user-editable and survives deploys, so treat it as untrusted. */
export function parseSaved(raw: string | null): SavedSearch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SavedSearch =>
        Boolean(s) &&
        typeof s.id === "string" &&
        typeof s.name === "string" &&
        typeof s.href === "string" &&
        typeof s.tcg === "string",
    );
  } catch {
    return [];
  }
}

export function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || "Untitled search";
}

/**
 * Adds a search, newest first.
 *
 * Re-saving the same filters renames the existing entry rather than adding a
 * near-identical second one — someone refining a name should not end up with
 * two rows that restore the same page.
 */
export function addSaved(
  existing: SavedSearch[],
  entry: { name: string; href: string; tcg: string; id: string; createdAt: string },
): SavedSearch[] {
  const withoutDupe = existing.filter((s) => s.href !== entry.href);
  return [{ ...entry, name: cleanName(entry.name) }, ...withoutDupe].slice(0, MAX_SAVED);
}

export function removeSaved(existing: SavedSearch[], id: string): SavedSearch[] {
  return existing.filter((s) => s.id !== id);
}

export function forGame(existing: SavedSearch[], tcg: string): SavedSearch[] {
  return existing.filter((s) => s.tcg === tcg);
}
