/**
 * priceMatch.ts — the evidence for a price-match request.
 *
 * Many Canadian retailers will match a competitor's price, but the buyer has to
 * assemble the case: the competing store, its price, a link, and the date. That
 * is thirty seconds of tedium standing between someone and real money, and we
 * already hold every piece of it.
 *
 * Two rules keep this honest:
 *
 *   - Only suggest a match against a retailer that actually has the item IN
 *     STOCK. Almost no policy honours an out-of-stock competitor price, so
 *     suggesting one wastes the buyer's time and annoys the store.
 *   - Never claim a policy exists. We do not track which retailers price match,
 *     so the wording says "if you price match" rather than asserting they do.
 */
import type { Product } from "./products";
import { SHIPPING_POLICIES } from "./shipping";

/** Below this, the saving is not worth anyone's time to request. */
export const MIN_MATCH_SAVING = 3;
/** Above this gap, a store is very unlikely to match — usually a data mismatch. */
export const MAX_CREDIBLE_GAP_PCT = 40;

export type PriceMatchCase = {
  /** The store you would ask. */
  askRetailer: string;
  askPrice: number;
  /** The cheaper competitor to cite. */
  citeRetailer: string;
  citePrice: number;
  citeUrl: string;
  saving: number;
  savingPct: number;
  /** Ready-to-send request text. */
  message: string;
};

/**
 * Build the case for asking `product.retailer`'s dearer competitors to match
 * the best price. Returns one case per retailer worth asking, dearest first —
 * those have the most to gain from matching.
 */
export function priceMatchCases(product: Product, today: Date = new Date()): PriceMatchCase[] {
  const offers = [
    { retailer: product.retailer, price: product.price, url: product.url, inStock: product.in_stock },
    ...(product.other_retailers ?? []).map((r) => ({
      retailer: r.retailer, price: r.price, url: r.url, inStock: r.in_stock,
    })),
  ].filter((o) => o.price > 0 && !SHIPPING_POLICIES[o.retailer]?.foreign);

  // The citation must be in stock: an out-of-stock competitor price is not
  // something a store will match.
  const citable = offers.filter((o) => o.inStock).sort((a, b) => a.price - b.price)[0];
  if (!citable) return [];

  const date = today.toISOString().slice(0, 10);

  return offers
    .filter((o) => o.retailer !== citable.retailer)
    .filter((o) => o.price - citable.price >= MIN_MATCH_SAVING)
    .filter((o) => ((o.price - citable.price) / o.price) * 100 <= MAX_CREDIBLE_GAP_PCT)
    .sort((a, b) => b.price - a.price)
    .map((o) => {
      const saving = Math.round((o.price - citable.price) * 100) / 100;
      return {
        askRetailer: o.retailer,
        askPrice: o.price,
        citeRetailer: citable.retailer,
        citePrice: citable.price,
        citeUrl: citable.url,
        saving,
        savingPct: Math.round(((saving / o.price) * 100) * 10) / 10,
        message:
          `Hi — I'd like to buy ${product.name} from you. ` +
          `You have it at $${o.price.toFixed(2)}; ${citable.retailer} currently lists it at ` +
          `$${citable.price.toFixed(2)} and has it in stock (checked ${date}): ${citable.url}. ` +
          `If you price match, I'd rather order from you. Thanks!`,
      };
    });
}
