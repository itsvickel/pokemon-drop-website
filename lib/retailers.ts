import type { Product } from "./products";
import { SHIPPING_POLICIES, type ShippingPolicy } from "./shipping";

/**
 * Per-retailer summaries, for the /retailers pages.
 *
 * These pages exist to answer a question the listing pages cannot: not "what is
 * cheapest right now" but "what is this shop like to buy from" — how much of
 * the catalogue it carries, where it sits on price, and what delivery costs.
 *
 * Everything here is derived from listings we actually hold. Nothing is
 * editorial and nothing is invented: a retailer with no published shipping
 * threshold gets no threshold, because a made-up number would make the
 * comparison worse than silence.
 */

export type RetailerSummary = {
  name: string;
  slug: string;
  /** Listings we currently track, across both games. */
  listings: number;
  inStock: number;
  sealed: number;
  singles: number;
  /** Games this retailer has listings for, e.g. ["mtg", "pokemon"]. */
  games: string[];
  cheapest: number | null;
  dearest: number | null;
  medianPrice: number | null;
  /** How often this retailer holds the best price we can find for a product. */
  bestPriceWins: number;
  policy: ShippingPolicy | null;
  lastUpdated: string | null;
};

/** URL-safe form of a retailer name. Stable, since it becomes a public path. */
export function retailerSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 100) / 100;
}

type Tagged = { product: Product; game: string };

/**
 * Summarise every retailer appearing in the given feeds.
 *
 * Each product carries one best listing plus its other retailers, so a
 * retailer's catalogue is assembled from both — otherwise a shop would only
 * appear for the products where it happens to be winning on price.
 */
export function summariseRetailers(feeds: { game: string; products: Product[] }[]): RetailerSummary[] {
  const rows = new Map<string, {
    prices: number[]; inStock: number; sealed: number; singles: number;
    games: Set<string>; wins: number; updated: string | null;
  }>();

  const touch = (name: string) => {
    let row = rows.get(name);
    if (!row) {
      row = { prices: [], inStock: 0, sealed: 0, singles: 0, games: new Set(), wins: 0, updated: null };
      rows.set(name, row);
    }
    return row;
  };

  const tagged: Tagged[] = feeds.flatMap((f) => f.products.map((product) => ({ product, game: f.game })));

  for (const { product, game } of tagged) {
    const isSingle = product.category === "single";

    const best = touch(product.retailer);
    best.prices.push(product.price);
    best.games.add(game);
    best.wins += 1;                      // this retailer holds the best price here
    if (product.in_stock) best.inStock += 1;
    if (isSingle) best.singles += 1; else best.sealed += 1;
    if (product.updated && (!best.updated || product.updated > best.updated)) {
      best.updated = product.updated;
    }

    for (const other of product.other_retailers ?? []) {
      const row = touch(other.retailer);
      row.prices.push(other.price);
      row.games.add(game);
      if (other.in_stock) row.inStock += 1;
      if (isSingle) row.singles += 1; else row.sealed += 1;
    }
  }

  return [...rows.entries()]
    .map(([name, row]) => {
      const sorted = [...row.prices].sort((a, b) => a - b);
      return {
        name,
        slug: retailerSlug(name),
        listings: row.prices.length,
        inStock: row.inStock,
        sealed: row.sealed,
        singles: row.singles,
        games: [...row.games].sort(),
        cheapest: sorted.length ? Math.round(sorted[0] * 100) / 100 : null,
        dearest: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : null,
        medianPrice: median(sorted),
        bestPriceWins: row.wins,
        policy: SHIPPING_POLICIES[name] ?? null,
        lastUpdated: row.updated,
      };
    })
    .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));
}

/**
 * The cheapest listings a retailer currently holds the best price on.
 *
 * Only products where they win: a page of listings where the visitor would be
 * better off elsewhere is not a reason to visit the shop, and pretending
 * otherwise is how comparison sites lose trust.
 */
export function bestSellersFor(products: Product[], retailer: string, limit = 12): Product[] {
  return products
    .filter((p) => p.retailer === retailer && p.in_stock)
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}
