/**
 * Listings too cheap to be the product their group describes.
 *
 * The size filter in ./sizeClass catches the cases a listing's own name gives
 * away — a "Booster Pack" sitting in a booster-box group. It cannot catch the
 * ones where the retailer's own title is wrong: an EB Games listing titled
 * "Paldea Evolved Booster Box" priced at $6.99, next to five real boxes between
 * $599 and $808. Seven groups were still showing a price like that as their
 * headline, including a Double Masters 25 booster box at $19.95 against a
 * $379.50 median.
 *
 * The rule is deliberately far outside anything a real discount reaches.
 * Clearance on sealed product runs to perhaps half price; it does not run to a
 * ninetieth. Anything below a tenth of what every other shop charges is bad
 * data, and showing it sends someone to buy a box and receive a pack.
 */

/**
 * A listing must be under this fraction of the group median to be discarded.
 * One tenth is roughly four times deeper than the deepest genuine sealed
 * discount, so the rule only fires on data that cannot be right.
 */
export const IMPLAUSIBLE_FRACTION = 0.1;

/**
 * Fewer listings than this and there is no meaningful median — with two, the
 * "outlier" and the "normal" price are the same claim with no tiebreak.
 */
export const MIN_LISTINGS_FOR_MEDIAN = 3;

export function median(values: number[]): number | null {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The floor below which a listing in this group is treated as bad data.
 * Returns null when the group is too small to judge, in which case nothing is
 * dropped — a wrong price is bad, but guessing on two data points is worse.
 */
export function implausibleFloor(groupPrices: number[]): number | null {
  const priced = groupPrices.filter((v) => v > 0);
  if (priced.length < MIN_LISTINGS_FOR_MEDIAN) return null;
  const mid = median(priced);
  return mid === null ? null : mid * IMPLAUSIBLE_FRACTION;
}

export function isImplausiblyCheap(price: number, groupPrices: number[]): boolean {
  const floor = implausibleFloor(groupPrices);
  return floor !== null && price < floor;
}
