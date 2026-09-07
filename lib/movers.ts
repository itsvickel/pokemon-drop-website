/**
 * movers.ts — "what moved this week", the shape MTGGoldfish and MTGStocks
 * built audiences on and no Canadian tracker offers.
 *
 * A mover list is only trustworthy if it excludes noise, so three filters apply
 * before anything is called a mover:
 *
 *   - enough tracked history to know the move is real, not our first sighting
 *   - a minimum price, because a 40% move on a $3 pack is not news
 *   - a cap on absurd swings, which in this data almost always means a product
 *     was regrouped or a retailer mis-listed rather than a genuine price change
 */
import type { Product } from "./products";
import { isSoldOutEverywhere, hasReliableLow } from "./products";

export const MIN_MOVE_PCT = 5;
export const MIN_PRICE = 15;
/** Above this, a "move" is far more likely to be bad data than a real swing. */
export const MAX_CREDIBLE_MOVE_PCT = 200;

export type MoverWindow = "price_change_1d" | "price_change_7d" | "price_change_30d";

export type Movers = {
  risers: Product[];
  fallers: Product[];
};

function credible(product: Product, field: MoverWindow): boolean {
  const change = product[field];
  if (change === null || change === undefined) return false;
  // A drop you cannot act on is not a mover. The crawler holds a listing's last
  // price after it sells out, so a product that fell and then sold out would sit
  // at the top of "biggest drops" pointing at something nobody can buy. The
  // digest and the alert rules already exclude sold-out products; this is the
  // page that did not.
  if (isSoldOutEverywhere(product)) return false;
  if (product.price < MIN_PRICE) return false;
  if (Math.abs(change) < MIN_MOVE_PCT) return false;
  if (Math.abs(change) > MAX_CREDIBLE_MOVE_PCT) return false;
  return hasReliableLow(product);
}

export function selectMovers(
  products: Product[],
  field: MoverWindow = "price_change_7d",
  limit = 24
): Movers {
  const eligible = (products ?? []).filter((p) => credible(p, field));
  const by = (a: Product, b: Product) => (a[field] ?? 0) - (b[field] ?? 0);

  // Split by direction BEFORE taking the top N. Sorting one pool two ways puts
  // the same product in both columns whenever fewer than `limit` items
  // qualify — so a product that rose would appear under "biggest drops".
  const fell = eligible.filter((p) => (p[field] ?? 0) < 0);
  const rose = eligible.filter((p) => (p[field] ?? 0) > 0);

  return {
    fallers: fell.sort(by).slice(0, limit),
    risers: rose.sort((a, b) => by(b, a)).slice(0, limit),
  };
}

/** Distinct sets with at least one sealed product, for the set index. */
export function setsWithCounts(products: Product[]): Array<{ set: string; count: number; cheapest: number }> {
  const map = new Map<string, { count: number; cheapest: number }>();
  for (const p of products ?? []) {
    if (!p.set_name || p.category === "single") continue;
    const cur = map.get(p.set_name);
    if (!cur) map.set(p.set_name, { count: 1, cheapest: p.price });
    else {
      cur.count += 1;
      if (p.price < cur.cheapest) cur.cheapest = p.price;
    }
  }
  return [...map.entries()]
    .map(([set, v]) => ({ set, ...v }))
    .sort((a, b) => b.count - a.count || a.set.localeCompare(b.set));
}

/** URL-safe slug for a set name, and the reverse match. */
export function setSlug(setName: string): string {
  return setName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function findSetBySlug(products: Product[], slug: string): string | null {
  for (const p of products ?? []) {
    if (p.set_name && setSlug(p.set_name) === slug) return p.set_name;
  }
  return null;
}
