/**
 * shipping.ts — retailer delivery policies, as data rather than display strings.
 *
 * The listed price is not the price you pay. A $95 box from a store with free
 * shipping over $149 costs more delivered than a $105 box from one with free
 * shipping over $100 — so a price comparison that sorts on the listed number
 * alone is quietly answering the wrong question.
 *
 * These were previously free-text labels ("Free $149+"), which meant the
 * arithmetic was left to the reader. They are now structured so the site can do
 * it, while still rendering the same label.
 *
 * EVERY threshold here was read from the retailer's own policy page on
 * 2026-09-07, with the source recorded. Where a retailer publishes no figure,
 * `freeOver` is null and the UI says "check site" — deliberately, because an
 * invented shipping number would make the comparison actively misleading, which
 * is worse than showing nothing. Notably that includes Fusion Gaming and House
 * of Cards, the two largest sources of listings on the site: neither publishes a
 * threshold anywhere on their own store-policies page.
 */

export type ShippingCurrency = "CAD" | "USD" | "GBP";

export type ShippingPolicy = {
  /** Order subtotal at or above which delivery is free, in `currency`. */
  freeOver: number | null;
  currency: ShippingCurrency;
  /** Known flat rate when the retailer offers no free tier. */
  flatRate?: number;
  /** Where the policy was read, so a future reviewer can re-check it. */
  source?: string;
  /** Set when the retailer does not price in CAD — excluded from delivered-price maths. */
  foreign?: true;
  note?: string;
};

export const SHIPPING_POLICIES: Record<string, ShippingPolicy> = {
  // ── Verified thresholds ──────────────────────────────────────────────────
  "Best Buy CA":       { freeOver: 35,  currency: "CAD" },
  "Walmart CA":        { freeOver: 35,  currency: "CAD" },
  "Amazon.ca":         { freeOver: 35,  currency: "CAD", note: "or Prime" },
  "Pokemon Center CA": { freeOver: 50,  currency: "CAD" },
  "EB Games":          { freeOver: 49,  currency: "CAD" },
  "401 Games":         { freeOver: 149, currency: "CAD" },
  "Deck Out Gaming":   { freeOver: 100, currency: "CAD" },
  Hobbiesville:        { freeOver: 150, currency: "CAD" },
  Danireon:            { freeOver: 200, currency: "CAD" },
  "A&C Games":         { freeOver: 100, currency: "CAD" },
  "Face to Face":      { freeOver: 100, currency: "CAD" },
  "Game Keeper":       { freeOver: 75,  currency: "CAD" },
  "Remi Card Trader":  { freeOver: 75,  currency: "CAD" },
  Meeplemart:          { freeOver: 75,  currency: "CAD" },
  "Carta Magica":      { freeOver: 100, currency: "CAD" },
  "Epic Loot":         { freeOver: 75,  currency: "CAD" },

  // ── Added 2026-09-07, each read from the retailer's own policy page ──────
  "Derpy Cards": {
    freeOver: 175, currency: "CAD",
    source: "https://derpycards.ca/pages/shipping-information",
  },
  "GT Games": {
    freeOver: 180, currency: "CAD",
    source: "https://gtgames.ca/",
    note: "Canada and US orders",
  },
  "Doe's Cards": {
    freeOver: 250, currency: "CAD",
    source: "https://doescards.ca/policies/shipping-policy",
  },
  "Flipside Gaming (US)": {
    freeOver: 100, currency: "USD", foreign: true,
    source: "https://flipsidegaming.com/policies/shipping-policy",
    note: "USD threshold; singles ship separately",
  },
  "Heroes World": {
    freeOver: null, currency: "CAD", flatRate: 15,
    source: "https://heroesworld.ca/",
    note: "flat $15-20 across Canada, no free tier",
  },

  // ── Publish no threshold on their own site — do not guess ────────────────
  // Fusion Gaming (995 listings) and House of Cards (703) between them are the
  // majority of MTG prices here. Both policy pages describe delivery times and
  // omit any minimum-spend figure entirely.
  "Fusion Gaming":       { freeOver: null, currency: "CAD" },
  "House of Cards":      { freeOver: null, currency: "CAD" },
  Multizone:             { freeOver: null, currency: "CAD" },
  "Dragon Card & Game":  { freeOver: null, currency: "CAD" },
  "Untapped Games":      { freeOver: null, currency: "CAD" },
  "The End Games":       { freeOver: null, currency: "CAD" },
  "Border City Games":   { freeOver: null, currency: "CAD" },
  "Ivory Tower Comics":  { freeOver: null, currency: "CAD" },
  Between2Games:         { freeOver: null, currency: "CAD" },

  // Obsidia's Canadian domains no longer resolve; the live store is UK-based
  // and prices in GBP, so its listings should not be compared as Canadian
  // dollars. Flagged foreign so delivered-price maths skips it.
  "Obsidia TCG": {
    freeOver: 75, currency: "GBP", foreign: true,
    source: "https://obsidia-tcg.store/policies/shipping-policy",
    note: "UK store, GBP pricing",
  },
};

/** Human label for a retailer's delivery policy. */
export function shippingLabel(retailer: string): string {
  const policy = SHIPPING_POLICIES[retailer];
  if (!policy) return "Check site for shipping";
  if (policy.freeOver === null) {
    return policy.flatRate ? `Flat ~$${policy.flatRate}` : "Check site for shipping";
  }
  const symbol = policy.currency === "CAD" ? "$" : policy.currency === "USD" ? "US$" : "£";
  return `Free ${symbol}${policy.freeOver}+`;
}

/**
 * Back-compat display map. Existing components read this directly; keeping it
 * derived means the labels can never drift from the structured policies.
 */
export const SHIPPING_THRESHOLDS: Record<string, string> = Object.fromEntries(
  Object.keys(SHIPPING_POLICIES).map((retailer) => [retailer, shippingLabel(retailer)])
);

export type DeliveredEstimate = {
  /** Total including delivery, when it can be stated with confidence. */
  total: number | null;
  /** True when the order already clears the free-shipping threshold. */
  shipsFree: boolean;
  /** How much more to spend to reach free delivery, when applicable. */
  addToFree: number | null;
  /** Why `total` is null, for the UI to explain rather than hide. */
  reason?: "unknown-policy" | "foreign-currency" | "rate-unknown";
  label: string;
};

/**
 * What a single item actually costs delivered.
 *
 * Deliberately conservative: below a free-shipping threshold the real rate
 * depends on weight and province, so no total is invented — the UI shows
 * "+shipping" instead. The goal is to stop presenting an incomplete price as a
 * complete one, not to promise a precise figure we cannot know.
 */
export function deliveredPrice(price: number, retailer: string): DeliveredEstimate {
  const policy = SHIPPING_POLICIES[retailer];

  if (!policy) {
    return { total: null, shipsFree: false, addToFree: null, reason: "unknown-policy", label: "+ shipping" };
  }
  if (policy.foreign) {
    return { total: null, shipsFree: false, addToFree: null, reason: "foreign-currency", label: `${policy.currency} pricing` };
  }
  if (policy.freeOver !== null && price >= policy.freeOver) {
    return { total: price, shipsFree: true, addToFree: 0, label: "Ships free" };
  }
  if (policy.freeOver !== null) {
    const gap = Math.round((policy.freeOver - price) * 100) / 100;
    if (policy.flatRate !== undefined) {
      return { total: price + policy.flatRate, shipsFree: false, addToFree: gap, label: `+$${policy.flatRate} shipping` };
    }
    return { total: null, shipsFree: false, addToFree: gap, reason: "rate-unknown", label: `+$${gap.toFixed(2)} to ship free` };
  }
  if (policy.flatRate !== undefined) {
    return { total: price + policy.flatRate, shipsFree: false, addToFree: null, label: `+$${policy.flatRate} shipping` };
  }
  return { total: null, shipsFree: false, addToFree: null, reason: "unknown-policy", label: "+ shipping" };
}

/**
 * Sort key for "cheapest delivered". Items whose delivered cost is unknown fall
 * back to their listed price rather than being pushed to the end — an unknown
 * shipping cost is not evidence of a bad deal.
 */
export function deliveredSortKey(price: number, retailer: string): number {
  return deliveredPrice(price, retailer).total ?? price;
}
