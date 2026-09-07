import type { Product, SetInfo } from "./products";
import type { ValuedHolding } from "./collection";

/**
 * How far through a set a collection is.
 *
 * Two things make this harder than counting rows, and both are about being
 * honest rather than flattering:
 *
 * 1. The denominator. Scryfall knows how many cards a set contains; we only
 *    know which cards Canadian shops currently list. Measuring against our own
 *    coverage would let someone "complete" a set they are nowhere near
 *    finishing, so the real total is used whenever it is known and the result
 *    says which of the two it used.
 *
 * 2. Duplicates. Four copies of one card is one card towards a set, not four.
 *    Distinct collector numbers are counted, not holdings.
 */

export type SetProgress = {
  setCode: string;
  setName: string;
  /** Distinct cards from this set that the collection holds. */
  owned: number;
  /** Cards in the set, or in what we track when the real size is unknown. */
  total: number;
  /** 0-100. Capped, since our card list can disagree with Scryfall's total. */
  percent: number;
  /**
   * False when `total` counts only the cards we track rather than the whole
   * set. The UI has to say so — the two numbers mean very different things.
   */
  totalIsComplete: boolean;
  /** Current market value of the cards from this set that are held. */
  marketValue: number;
  releasedAt: string;
};

/** Below this a set is more likely a stray single than a set being collected. */
export const MIN_CARDS_TO_TRACK = 2;

/**
 * A card's identity within its set. Collector number rather than name: the same
 * card can appear twice in a set under different numbers, and the same name
 * across treatments is still one slot in the numbered run.
 */
function slotOf(product: Product): string | null {
  const card = product.card;
  if (!card?.set_code) return null;
  return card.collector_number || card.card_name || null;
}

export function setProgress(
  holdings: ValuedHolding[],
  sets: Record<string, SetInfo> | undefined,
  /** Every tracked product, used only to size sets Scryfall could not. */
  catalogue: Product[],
): SetProgress[] {
  const owned = new Map<string, { slots: Set<string>; name: string; value: number }>();

  for (const holding of holdings) {
    const product = holding.product;
    if (!product) continue;
    const slot = slotOf(product);
    const code = product.card?.set_code?.toLowerCase();
    if (!slot || !code) continue;

    const entry = owned.get(code) ?? {
      slots: new Set<string>(),
      name: product.card?.set_name || code.toUpperCase(),
      value: 0,
    };
    entry.slots.add(slot);
    // Value counts every copy, unlike completion — two of a card really is
    // twice the money even though it is one card towards the set.
    entry.value += holding.marketValue ?? 0;
    owned.set(code, entry);
  }

  // Fallback denominator, only for sets Scryfall did not size for us.
  const trackedPerSet = new Map<string, Set<string>>();
  for (const product of catalogue) {
    const code = product.card?.set_code?.toLowerCase();
    const slot = slotOf(product);
    if (!code || !slot || sets?.[code]) continue;
    const slots = trackedPerSet.get(code) ?? new Set<string>();
    slots.add(slot);
    trackedPerSet.set(code, slots);
  }

  const rows: SetProgress[] = [];
  for (const [code, entry] of owned) {
    const known = sets?.[code];
    const total = known?.total ?? trackedPerSet.get(code)?.size ?? entry.slots.size;
    if (total < MIN_CARDS_TO_TRACK) continue;

    rows.push({
      setCode: code,
      setName: known?.name || entry.name,
      owned: entry.slots.size,
      total,
      // Our card list and Scryfall's total can disagree — a promo we matched
      // into the set, say — and 103% complete reads as a bug, not a bonus.
      percent: Math.min(100, Math.round((entry.slots.size / total) * 100)),
      totalIsComplete: Boolean(known),
      marketValue: Math.round(entry.value * 100) / 100,
      releasedAt: known?.released_at ?? "",
    });
  }

  // Nearest to finished first: that is the set someone is most likely to act on.
  return rows.sort((a, b) => b.percent - a.percent || b.owned - a.owned);
}
