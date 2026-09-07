/**
 * cartOptimizer.ts — the cheapest way to actually buy a list.
 *
 * Buying every item at its individually lowest price usually means six stores
 * and six shipping fees, which is often more expensive than buying the same
 * basket from two. Nobody in Canada solves this, and the two inputs it needs —
 * per-retailer prices and free-shipping thresholds — are already here.
 *
 * THE PROBLEM
 * Assign each wanted item to a retailer that stocks it, minimising
 *   sum(item prices) + sum(shipping for each retailer used)
 * where a retailer's shipping is free above its threshold. This is a
 * facility-location problem and NP-hard in general, so this does not pretend to
 * prove optimality.
 *
 * THE APPROACH
 * Only retailers that carry at least one wanted item can matter, which for a
 * real basket is a couple of dozen rather than 72. Over that reduced set we
 * exhaustively evaluate every combination of up to MAX_STORES retailers, and
 * within each combination assign each item to its cheapest member. For the
 * basket sizes people actually have, that is both fast and exact for the chosen
 * store limit — and capping at three stores is itself the realistic constraint,
 * since nobody wants to place eight orders.
 *
 * HONESTY
 * A retailer that publishes no shipping policy cannot be costed, so its
 * shipping is treated as unknown rather than zero — otherwise the optimiser
 * would systematically favour exactly the stores we know least about. Those
 * plans are returned flagged, not silently ranked first.
 */
import type { Product } from "./products";
import { SHIPPING_POLICIES, deliveredPrice } from "./shipping";
import { withTax } from "./tax";

/** Beyond this, the plan stops being something a person would actually do. */
export const MAX_STORES = 3;
/** Guard: combinations grow fast, so cap the candidate retailer pool. */
export const MAX_CANDIDATE_RETAILERS = 22;

/**
 * What an unpriced order is ASSUMED to cost, for ranking only.
 *
 * Nine of the tracked retailers publish no shipping policy. Scoring those at
 * zero made every extra order look free, so consolidating could only ever look
 * worse and the optimiser reliably recommended more orders than necessary.
 * Charging a plausible parcel rate restores the trade-off.
 *
 * This number never reaches the UI: displayed shipping for these stores stays
 * "unknown", and the store is listed in unpricedShipping. It exists solely so
 * two plans can be compared on equal terms.
 */
export const ASSUMED_UNKNOWN_SHIPPING = 15;

export type WantedItem = {
  group_key: string;
  name: string;
  quantity: number;
};

export type Offer = {
  retailer: string;
  price: number;
  url: string;
  inStock: boolean;
};

export type PlanLine = {
  item: WantedItem;
  retailer: string;
  unitPrice: number;
  lineTotal: number;
  url: string;
};

export type StoreSubtotal = {
  retailer: string;
  items: number;
  subtotal: number;
  shipping: number | null;
  shipsFree: boolean;
  /** How much more to spend at this store to reach free delivery. */
  addToFree: number | null;
  shippingKnown: boolean;
};

export type CartPlan = {
  lines: PlanLine[];
  stores: StoreSubtotal[];
  itemsTotal: number;
  /** Shipping we could actually price. Null when no store's policy is known. */
  shippingTotal: number | null;
  tax: number;
  /** Best-known total. Excludes shipping we could not price — see unpriced. */
  total: number;
  /** Retailers in the plan whose shipping cost is unknown. */
  unpricedShipping: string[];
  /** True when every item could be sourced. */
  complete: boolean;
  missing: WantedItem[];
  /**
   * Total used for RANKING only, charging ASSUMED_UNKNOWN_SHIPPING for orders
   * we cannot price. Never shown — `total` is what the reader sees.
   */
  rankScore: number;
};

/** All offers for one product, cheapest first, in-stock preferred. */
export function offersFor(product: Product | undefined): Offer[] {
  if (!product) return [];
  const rows: Offer[] = [
    { retailer: product.retailer, price: product.price, url: product.url, inStock: product.in_stock },
    ...(product.other_retailers ?? []).map((r) => ({
      retailer: r.retailer, price: r.price, url: r.url, inStock: r.in_stock,
    })),
  ];
  // Foreign-currency retailers cannot be compared against CAD prices.
  return rows
    .filter((o) => o.price > 0 && !SHIPPING_POLICIES[o.retailer]?.foreign)
    .sort((a, b) => (a.inStock === b.inStock ? a.price - b.price : a.inStock ? -1 : 1));
}

function combinations<T>(pool: T[], size: number): T[][] {
  if (size === 0) return [[]];
  const out: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length === size) { out.push([...current]); return; }
    for (let i = start; i < pool.length; i++) {
      current.push(pool[i]);
      walk(i + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return out;
}

function evaluate(
  wanted: WantedItem[],
  offersByKey: Map<string, Offer[]>,
  retailers: string[],
  province: string | null
): CartPlan | null {
  const chosen = new Set(retailers);
  const lines: PlanLine[] = [];
  const missing: WantedItem[] = [];

  for (const item of wanted) {
    const candidates = (offersByKey.get(item.group_key) ?? []).filter((o) => chosen.has(o.retailer));
    if (candidates.length === 0) { missing.push(item); continue; }
    const best = candidates.reduce((a, b) => (b.price < a.price ? b : a));
    lines.push({
      item,
      retailer: best.retailer,
      unitPrice: best.price,
      lineTotal: best.price * item.quantity,
      url: best.url,
    });
  }

  // A combination that cannot supply anything is not a plan.
  if (lines.length === 0) return null;

  const byRetailer = new Map<string, PlanLine[]>();
  for (const line of lines) {
    const list = byRetailer.get(line.retailer) ?? [];
    list.push(line);
    byRetailer.set(line.retailer, list);
  }

  const stores: StoreSubtotal[] = [];
  let itemsTotal = 0;
  let shippingTotal = 0;
  let anyShippingKnown = false;
  const unpricedShipping: string[] = [];

  for (const [retailer, group] of byRetailer) {
    const subtotal = group.reduce((sum, l) => sum + l.lineTotal, 0);
    itemsTotal += subtotal;

    // Shipping is decided by the CART subtotal at that store, which is the
    // whole reason consolidating can beat buying each item at its lowest price.
    const est = deliveredPrice(subtotal, retailer);
    const shipping = est.shipsFree ? 0 : est.total !== null ? est.total - subtotal : null;

    if (shipping === null) unpricedShipping.push(retailer);
    else { shippingTotal += shipping; anyShippingKnown = true; }

    stores.push({
      retailer,
      items: group.reduce((n, l) => n + l.item.quantity, 0),
      subtotal: Math.round(subtotal * 100) / 100,
      shipping,
      shipsFree: est.shipsFree,
      addToFree: est.addToFree,
      shippingKnown: shipping !== null,
    });
  }

  const knownShipping = anyShippingKnown || unpricedShipping.length === 0 ? shippingTotal : 0;
  const preTax = itemsTotal + knownShipping;
  const taxed = withTax(preTax, province);

  // Ranking charges a plausible rate for each order we cannot price, so a plan
  // with four unpriced orders is not scored as though postage were free.
  const rankPreTax = itemsTotal + shippingTotal + unpricedShipping.length * ASSUMED_UNKNOWN_SHIPPING;
  const rankScore = withTax(rankPreTax, province);

  return {
    lines,
    stores: stores.sort((a, b) => b.subtotal - a.subtotal),
    itemsTotal: Math.round(itemsTotal * 100) / 100,
    shippingTotal: unpricedShipping.length === stores.length ? null : Math.round(knownShipping * 100) / 100,
    tax: Math.round((taxed - preTax) * 100) / 100,
    total: Math.round(taxed * 100) / 100,
    unpricedShipping,
    complete: missing.length === 0,
    missing,
    rankScore: Math.round(rankScore * 100) / 100,
  };
}

export type OptimizeResult = {
  /** Best plan found, or null when nothing in the basket could be sourced. */
  best: CartPlan | null;
  /** Everything at its individually lowest price, for comparison. */
  naive: CartPlan | null;
  /**
   * Dollar saving against buying each item at its lowest price — but ONLY when
   * every order in both plans could be priced. With unpriced shipping the two
   * totals are not comparable, and quoting a figure would be inventing one.
   */
  saving: number | null;
  /** Orders avoided by consolidating. Meaningful even when saving is null. */
  fewerOrders: number;
  consideredRetailers: number;
};

/**
 * Find the cheapest realistic way to buy `wanted`.
 *
 * Ranks complete plans above incomplete ones — a plan that skips half the
 * basket is not cheaper, it is a different basket — then by total, then by
 * fewer stores, since two orders beat three at the same price.
 */
export function optimizeCart(
  wanted: WantedItem[],
  products: Product[],
  options: { province?: string | null; maxStores?: number } = {}
): OptimizeResult {
  const province = options.province ?? null;
  const maxStores = Math.max(1, Math.min(options.maxStores ?? MAX_STORES, MAX_STORES));

  const byKey = new Map(products.map((p) => [p.group_key, p]));
  const offersByKey = new Map<string, Offer[]>();
  for (const item of wanted) offersByKey.set(item.group_key, offersFor(byKey.get(item.group_key)));

  // Only retailers carrying something wanted can matter. Rank by how much of
  // the basket they can supply so the cap keeps the most useful ones.
  const reach = new Map<string, number>();
  for (const offers of offersByKey.values()) {
    for (const o of offers) reach.set(o.retailer, (reach.get(o.retailer) ?? 0) + 1);
  }
  const candidates = [...reach.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CANDIDATE_RETAILERS)
    .map(([retailer]) => retailer);

  if (candidates.length === 0) {
    return { best: null, naive: null, saving: null, fewerOrders: 0, consideredRetailers: 0 };
  }

  // Baseline: each item at its own cheapest retailer, however many that takes.
  const naive = evaluate(wanted, offersByKey, [...reach.keys()], province);

  let best: CartPlan | null = null;
  for (let size = 1; size <= Math.min(maxStores, candidates.length); size++) {
    for (const combo of combinations(candidates, size)) {
      const plan = evaluate(wanted, offersByKey, combo, province);
      if (!plan) continue;
      if (!best) { best = plan; continue; }

      // Complete beats incomplete before price is even considered.
      if (plan.complete !== best.complete) {
        if (plan.complete) best = plan;
        continue;
      }
      if (plan.rankScore < best.rankScore - 0.005) { best = plan; continue; }
      // Same money, fewer orders.
      if (Math.abs(plan.rankScore - best.rankScore) <= 0.005 && plan.stores.length < best.stores.length) {
        best = plan;
      }
    }
  }

  // The store cap can make the best CONSOLIDATED plan worse than simply buying
  // each item wherever it is cheapest. Recommending that would be absurd, so the
  // naive plan wins outright when it scores better and covers as much.
  if (naive && best && naive.rankScore < best.rankScore - 0.005) {
    const naiveAtLeastAsComplete = naive.complete || !best.complete;
    if (naiveAtLeastAsComplete) best = naive;
  }

  // A dollar saving is only quotable when both plans are fully priced. If any
  // order has unknown shipping the totals are not like-for-like, so the honest
  // thing to report is the number of orders avoided, not a made-up figure.
  const bothPriced =
    !!best && !!naive && best.unpricedShipping.length === 0 && naive.unpricedShipping.length === 0;
  const saving =
    bothPriced && naive!.complete === best!.complete
      ? Math.round((naive!.total - best!.total) * 100) / 100
      : null;

  const fewerOrders = best && naive ? Math.max(0, naive.stores.length - best.stores.length) : 0;

  return { best, naive, saving, fewerOrders, consideredRetailers: candidates.length };
}
