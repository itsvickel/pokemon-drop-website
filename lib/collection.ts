/**
 * collection.ts — what you own, and what it is worth now.
 *
 * The wishlist tracks what someone wants; nothing tracked what they hold. This
 * is the difference between a price list people visit when buying and a
 * portfolio they check weekly — which is why it is the strongest retention
 * feature on comparable sites.
 *
 * The valuation rules matter more than the arithmetic:
 *
 *   - Cost basis is optional. Plenty of people want to record what they own
 *     without a purchase price, and treating a missing cost as zero would show
 *     a fabricated 100% gain on everything.
 *   - A holding whose product is no longer tracked is shown as unvalued rather
 *     than counted at zero. Silently dropping to zero would look like a crash.
 *   - Totals report how much of the collection they actually cover, so an
 *     incomplete valuation cannot be mistaken for a complete one.
 */
import type { Product } from "./products";

export type Holding = {
  id?: string;
  group_key: string;
  product_name: string;
  tcg: string;
  quantity: number;
  /** Per-unit price paid, in CAD. Null when the owner did not record one. */
  unit_cost: number | null;
  purchased_at: string | null;
  notes?: string | null;
};

export type ValuedHolding = Holding & {
  /** Current best price per unit, when the product is still tracked. */
  marketPrice: number | null;
  marketValue: number | null;
  costTotal: number | null;
  /** Absolute gain/loss, only when both sides are known. */
  gain: number | null;
  gainPct: number | null;
  product?: Product;
};

export type PortfolioTotals = {
  holdings: number;
  units: number;
  marketValue: number;
  costTotal: number;
  gain: number;
  gainPct: number | null;
  /** Holdings we could price — the denominator for honesty about coverage. */
  valued: number;
  /** Holdings with a recorded cost basis, so P/L coverage is explicit. */
  withCost: number;
};

export function valueHolding(holding: Holding, byKey: Map<string, Product>): ValuedHolding {
  const product = byKey.get(holding.group_key);
  const marketPrice = product ? product.price : null;
  const marketValue = marketPrice === null ? null : marketPrice * holding.quantity;
  const costTotal = holding.unit_cost === null ? null : holding.unit_cost * holding.quantity;

  const gain = marketValue !== null && costTotal !== null ? marketValue - costTotal : null;
  const gainPct = gain !== null && costTotal ? (gain / costTotal) * 100 : null;

  return { ...holding, marketPrice, marketValue, costTotal, gain, gainPct, product };
}

export function valueCollection(holdings: Holding[], products: Product[]): ValuedHolding[] {
  const byKey = new Map(products.map((p) => [p.group_key, p]));
  return (holdings ?? []).map((h) => valueHolding(h, byKey));
}

export function portfolioTotals(valued: ValuedHolding[]): PortfolioTotals {
  let marketValue = 0;
  let costTotal = 0;
  let units = 0;
  let priced = 0;
  let withCost = 0;

  for (const v of valued ?? []) {
    units += v.quantity;
    if (v.marketValue !== null) {
      marketValue += v.marketValue;
      priced += 1;
    }
    if (v.costTotal !== null) {
      costTotal += v.costTotal;
      withCost += 1;
    }
  }

  // Gain is only meaningful across holdings that have BOTH sides, so it is
  // summed from those rather than differencing two partly-populated totals.
  const comparable = (valued ?? []).filter((v) => v.gain !== null);
  const gain = comparable.reduce((sum, v) => sum + (v.gain ?? 0), 0);
  const gainBasis = comparable.reduce((sum, v) => sum + (v.costTotal ?? 0), 0);

  return {
    holdings: (valued ?? []).length,
    units,
    marketValue: Math.round(marketValue * 100) / 100,
    costTotal: Math.round(costTotal * 100) / 100,
    gain: Math.round(gain * 100) / 100,
    gainPct: gainBasis > 0 ? (gain / gainBasis) * 100 : null,
    valued: priced,
    withCost,
  };
}

/** Plain-language caveat when a valuation does not cover everything. */
export function coverageNote(totals: PortfolioTotals): string | null {
  if (totals.holdings === 0) return null;
  const unpriced = totals.holdings - totals.valued;
  const noCost = totals.holdings - totals.withCost;
  const parts: string[] = [];
  if (unpriced > 0) parts.push(`${unpriced} no longer tracked, so unvalued`);
  if (noCost > 0) parts.push(`${noCost} without a recorded cost, so excluded from profit`);
  return parts.length ? `Note: ${parts.join("; ")}.` : null;
}
