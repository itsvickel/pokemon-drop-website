/**
 * insights.ts — the derived signals that turn a price list into a price tracker.
 *
 * Everything here answers a question a buyer actually asks, using only data the
 * crawler already produces:
 *
 *   "how does this compare?"   -> priceVerdict, against our own history
 *   "is a box or a pack better value?" -> pricePerPack, normalised
 *   "is this moving?"          -> changeOver, 1 / 7 / 30 day windows
 *   "has it held value?"       -> roiSinceRelease
 *   "am I buying in CAD?"      -> foreign-currency detection lives in shipping.ts
 *
 * Deliberately NOT here: expected value of opening a box. That space is served
 * by four mature free tools running Monte Carlo over community pull rates, and
 * a half-modelled EV number would be worse than linking to one of them.
 */
import { LOW_BADGE_MIN_DAYS, PRICE_WINDOW_DAYS } from "./siteFacts";
import { historySpanDays, parseDate, type HistoryEntry } from "./products";

// ── Price per pack ────────────────────────────────────────────────────────────

/**
 * Cost of one booster, so a box, a bundle and a loose pack can be compared.
 * Returns null when the pack count is unknown rather than guessing — Secret
 * Lairs and Commander decks have no meaningful pack count.
 */
export function pricePerPack(price: number, packs: number | null): number | null {
  if (!packs || packs < 2 || !Number.isFinite(price) || price <= 0) return null;
  return price / packs;
}

// ── Change over a window ──────────────────────────────────────────────────────

export type ChangeWindow = 1 | 7 | 30;

/**
 * Percent change over the last `days`, comparing today's price to the oldest
 * observation still inside the window. Null when there is no observation old
 * enough — an absent number is honest, a zero would imply stability we did not
 * observe.
 */
export function changeOver(
  entries: HistoryEntry[] | undefined,
  currentPrice: number,
  days: ChangeWindow,
  now: Date = new Date()
): number | null {
  if (!entries || entries.length < 2 || !currentPrice) return null;

  // History entries are dates, not instants, so they parse to midnight UTC.
  // Comparing them against a time-of-day cutoff would drop an observation made
  // on the boundary day itself — the oldest and most useful point in the window.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cutoff = today - days * 86_400_000;

  let oldest: { t: number; price: number } | null = null;
  for (const entry of entries) {
    const t = parseDate(entry.date).getTime();
    if (t <= 0 || t > today) continue;
    if (t < cutoff) continue;
    if (!oldest || t < oldest.t) oldest = { t, price: entry.price };
  }
  if (!oldest || oldest.price <= 0) return null;
  // Require the window to be meaningfully covered, else a 30-day change
  // computed from two days of data reads as a 30-day trend.
  if (today - oldest.t < days * 86_400_000 * 0.5) return null;
  return ((currentPrice - oldest.price) / oldest.price) * 100;
}

// ── Verdict against our own history ───────────────────────────────────────────

export type VerdictTone = "great" | "good" | "typical" | "high" | "unknown";

export type PriceVerdict = {
  tone: VerdictTone;
  /** Short label for a badge. */
  label: string;
  /** One sentence explaining the label, for a tooltip. */
  detail: string;
  /** Percent below (negative) or above the window average. */
  vsAverage: number | null;
};

const UNKNOWN: PriceVerdict = {
  tone: "unknown",
  label: "Not enough history",
  detail: `We have tracked this for under ${LOW_BADGE_MIN_DAYS} days, which is too short to judge a price.`,
  vsAverage: null,
};

/**
 * Is this a good price, judged against what we have actually seen?
 *
 * Explicitly not judged against MSRP: that field is null on every product
 * because the configured reference retailers do not appear in the scraped data.
 * Comparing to our own observed range is both available and more honest — it is
 * what a human deal editor does by hand.
 */
export function priceVerdict(
  price: number,
  entries: HistoryEntry[] | undefined,
  now: Date = new Date()
): PriceVerdict {
  if (!entries || entries.length < 2) return UNKNOWN;
  if (historySpanDays(entries) < LOW_BADGE_MIN_DAYS) return UNKNOWN;

  const prices = entries.map((e) => e.price).filter((p) => p > 0);
  if (prices.length < 2) return UNKNOWN;

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min = Math.min(...prices);
  if (avg <= 0) return UNKNOWN;

  const vsAverage = ((price - avg) / avg) * 100;
  const window = `${PRICE_WINDOW_DAYS}-day`;

  if (price <= min + 0.0001) {
    return {
      tone: "great",
      label: `Lowest in ${PRICE_WINDOW_DAYS} days`,
      detail: `This is the cheapest we have seen it in our ${window} window.`,
      vsAverage,
    };
  }
  if (vsAverage <= -10) {
    return {
      tone: "good",
      label: `${Math.abs(Math.round(vsAverage))}% below average`,
      detail: `Cheaper than the ${window} average of $${avg.toFixed(2)}.`,
      vsAverage,
    };
  }
  if (vsAverage >= 10) {
    return {
      tone: "high",
      label: `${Math.round(vsAverage)}% above average`,
      detail: `Dearer than the ${window} average of $${avg.toFixed(2)} — worth waiting.`,
      vsAverage,
    };
  }
  return {
    tone: "typical",
    label: "Typical price",
    detail: `About the ${window} average of $${avg.toFixed(2)}.`,
    vsAverage,
  };
}

// ── Return since release ──────────────────────────────────────────────────────

export type ReleaseRoi = {
  pct: number;
  days: number;
  /** True once the set is old enough that print runs have typically ended. */
  likelyOutOfPrint: boolean;
};

/** Sets are generally printed for around 18 months after release. */
export const OUT_OF_PRINT_DAYS = 550;

/**
 * Change since the earliest price we recorded, plus how long ago the set came
 * out. Sealed product tends to appreciate once printing stops, which is the
 * whole thesis behind sealed-as-investment.
 *
 * Note this measures from our FIRST OBSERVATION, not from launch — we cannot
 * know a price from before we started watching, and pretending otherwise would
 * overstate returns on anything released before June 2026.
 */
export function roiSinceFirstSeen(
  price: number,
  entries: HistoryEntry[] | undefined,
  releaseDate?: string,
  now: Date = new Date()
): ReleaseRoi | null {
  if (!entries || entries.length < 2 || price <= 0) return null;
  const dated = entries
    .map((e) => ({ t: parseDate(e.date).getTime(), price: e.price }))
    .filter((e) => e.t > 0 && e.price > 0)
    .sort((a, b) => a.t - b.t);
  if (dated.length < 2) return null;

  const first = dated[0];
  const days = Math.round((now.getTime() - first.t) / 86_400_000);
  if (days < LOW_BADGE_MIN_DAYS) return null;

  const sinceRelease = releaseDate
    ? Math.round((now.getTime() - parseDate(releaseDate).getTime()) / 86_400_000)
    : null;

  return {
    pct: ((price - first.price) / first.price) * 100,
    days,
    likelyOutOfPrint: sinceRelease !== null && sinceRelease >= OUT_OF_PRINT_DAYS,
  };
}

// ── Percentile and fake-discount detection ────────────────────────────────────

/**
 * Where today's price sits in the observed range, as a percentile.
 *
 * "Cheaper than 91% of the last 90 days" is a far stronger claim than a badge,
 * and it costs nothing extra — the series is already loaded. Returns null when
 * the history is too short to support the sentence, because a percentile over
 * four observations is arithmetic pretending to be evidence.
 */
export function pricePercentile(
  price: number,
  entries: HistoryEntry[] | undefined
): number | null {
  if (!entries || entries.length < 10) return null;
  if (historySpanDays(entries) < LOW_BADGE_MIN_DAYS) return null;

  const prices = entries.map((e) => e.price).filter((p) => p > 0);
  if (prices.length < 10) return null;

  const cheaperThan = prices.filter((p) => p > price).length;
  return Math.round((cheaperThan / prices.length) * 100);
}

export type DiscountCheck = {
  /** True when a "sale" is not actually a reduction from the recent norm. */
  suspicious: boolean;
  /** Days the price has sat at or above the current level. */
  daysAtPrice: number;
  message: string | null;
};

/** A price must be unchanged this long before we call a "sale" into question. */
export const STALE_SALE_DAYS = 21;

/**
 * Is this "discount" real?
 *
 * Retailers inflate reference prices routinely. We hold the actual series, so
 * we can say when a price has simply been sitting where it is. This is the same
 * instinct as siteFacts — pointed outward instead of inward — and it is the
 * behaviour CamelCamelCamel built its reputation on.
 *
 * Conservative by construction: it only speaks up when the price has been flat
 * for weeks, and never accuses a retailer of anything, it just states how long
 * the price has held.
 */
export function discountCheck(
  price: number,
  entries: HistoryEntry[] | undefined,
  now: Date = new Date()
): DiscountCheck {
  const quiet: DiscountCheck = { suspicious: false, daysAtPrice: 0, message: null };
  if (!entries || entries.length < 6) return quiet;

  const dated = entries
    .map((e) => ({ t: parseDate(e.date).getTime(), price: e.price }))
    .filter((e) => e.t > 0 && e.price > 0)
    .sort((a, b) => b.t - a.t);
  if (dated.length < 6) return quiet;

  // Walk back while the price stays within a rounding cent of today's.
  const tolerance = Math.max(0.01, price * 0.005);
  let oldestSame = dated[0].t;
  for (const point of dated) {
    if (Math.abs(point.price - price) > tolerance) break;
    oldestSame = point.t;
  }

  const days = Math.round((now.getTime() - oldestSame) / 86_400_000);
  if (days < STALE_SALE_DAYS) return { suspicious: false, daysAtPrice: days, message: null };

  return {
    suspicious: true,
    daysAtPrice: days,
    message: `This price hasn't changed in ${days} days — any "sale" badge is not a recent reduction.`,
  };
}
