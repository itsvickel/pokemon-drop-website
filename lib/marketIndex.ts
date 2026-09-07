/**
 * marketIndex.ts — one number for "how is the market doing".
 *
 * A single tracked figure gives people a reason to check back, gives a
 * collection something to benchmark against, and is the sort of thing that gets
 * cited. It is also easy to do badly, so the methodology is stated rather than
 * implied — the index is computed the same way every time and says so.
 *
 * METHOD
 *   - Sealed product only. Singles move on entirely different dynamics.
 *   - Median of per-product percent change, not mean. One mis-scraped listing
 *     swinging 3000% would drag a mean anywhere; a median ignores it.
 *   - Only products above a floor price and with enough tracked history, for
 *     the same reason the movers list filters: below that, a percentage
 *     describes noise.
 *   - Reported with its sample size. An index over nine products is not an
 *     index, and hiding n would be the dishonest part.
 */
import type { Product } from "./products";
import { hasReliableLow } from "./products";
import type { MoverWindow } from "./movers";

export const INDEX_MIN_PRICE = 15;
/** Beyond this, a move is far more likely to be bad data than market movement. */
export const INDEX_MAX_MOVE = 200;
/** Below this many constituents the number is not worth printing. */
export const INDEX_MIN_SAMPLE = 20;

export type MarketIndex = {
  /** Median percent change across constituents, or null when too thin. */
  change: number | null;
  /** How many products the figure is computed over. */
  sample: number;
  window: MoverWindow;
  /** Share of constituents that rose, as a breadth signal. */
  advancing: number | null;
};

export function marketIndex(
  products: Product[],
  window: MoverWindow = "price_change_7d"
): MarketIndex {
  const constituents = (products ?? []).filter((p) => {
    const change = p[window];
    if (change === null || change === undefined) return false;
    if (p.category === "single") return false;
    if (p.price < INDEX_MIN_PRICE) return false;
    if (Math.abs(change) > INDEX_MAX_MOVE) return false;
    return hasReliableLow(p);
  });

  if (constituents.length < INDEX_MIN_SAMPLE) {
    return { change: null, sample: constituents.length, window, advancing: null };
  }

  const changes = constituents.map((p) => p[window] as number).sort((a, b) => a - b);
  const mid = Math.floor(changes.length / 2);
  const median =
    changes.length % 2 === 0 ? (changes[mid - 1] + changes[mid]) / 2 : changes[mid];

  return {
    change: Math.round(median * 100) / 100,
    sample: constituents.length,
    window,
    advancing: Math.round((changes.filter((c) => c > 0).length / changes.length) * 100),
  };
}

/** One sentence a reader can act on, including the caveat. */
export function describeIndex(index: MarketIndex, label: string): string {
  if (index.change === null) {
    return `Not enough tracked ${label} products yet to report a market move (${index.sample} of ${INDEX_MIN_SAMPLE} needed).`;
  }
  const dir = index.change > 0 ? "up" : index.change < 0 ? "down" : "flat";
  const magnitude = index.change === 0 ? "" : ` ${Math.abs(index.change).toFixed(2)}%`;
  return `${label} sealed is ${dir}${magnitude} over the last week — median across ${index.sample} tracked products, ${index.advancing}% of them rising.`;
}
