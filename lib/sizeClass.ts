/**
 * Which unit of product a listing name or group key describes.
 *
 * A mirror of size_class in tcg-drop-alert/tracker_core.py, and deliberately a
 * duplicate rather than an import: the crawler decides the stored best price,
 * but the site is what people read, and it should not display a price that
 * contradicts the listings shown right beside it.
 *
 * The bug this exists for: 21 Foundations booster boxes at $219-$255 shared a
 * group with one $6.95 booster pack, and since a group shows its cheapest
 * listing the page advertised a booster box for $6.95. 126 groups across both
 * games mixed units this way. The crawler now filters these out, but its state
 * only refreshes twice a day — this closes the gap in the meantime, and keeps
 * the site correct if a stale key ever reappears.
 */

/** Most specific first: a "Booster Box Case" is a case, not a box. */
const SIZE_CLASS_PRIORITY = ["case", "box", "bundle", "tin", "deck", "blister", "pack"] as const;

export type SizeClass = (typeof SIZE_CLASS_PRIORITY)[number];

/**
 * Product lines whose name says what they are without using the generic word.
 *
 * A Checklane Blister is the single-pack rack product sold at supermarket
 * tills. EB Games lists it as "Chaos Rising Checklane Booster" — no size word
 * at all — so it landed in the booster-box group and, at $8.99 against boxes of
 * $242 and $325, dragged the group's median far enough down that the filters
 * stopped seeing anything wrong.
 */
const SIZE_SYNONYMS: Record<string, SizeClass> = {
  checklane: "blister",
  etb: "box",          // Elite Trainer Box
  minitin: "tin",
};

export function sizeClass(text: string | null | undefined): SizeClass | null {
  // Whole words only — "Boxer Rebellion" is not a box.
  const words = new Set((text ?? "").toLowerCase().match(/[a-z]+/g) ?? []);
  for (const cls of SIZE_CLASS_PRIORITY) {
    if (words.has(cls) || words.has(`${cls}s`) || words.has(`${cls}es`)) return cls;
  }
  for (const [word, cls] of Object.entries(SIZE_SYNONYMS)) {
    if (words.has(word) || words.has(`${word}s`)) return cls;
  }
  return null;
}

/**
 * True when a listing is a different unit of product than its group.
 *
 * Listings that name no unit are never a conflict: the group key already says
 * what the group is, and most listings do not repeat it.
 */
export function conflictsWithGroup(listingName: string, groupKey: string): boolean {
  const wanted = sizeClass(groupKey);
  if (wanted === null) return false;
  const actual = sizeClass(listingName);
  return actual !== null && actual !== wanted;
}
