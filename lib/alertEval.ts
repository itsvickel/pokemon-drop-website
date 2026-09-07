/**
 * alertEval.ts — pure alert evaluation, shared by the /api/check-alerts cron.
 * Kept free of I/O so it can be unit tested.
 *
 * A fixed price threshold per product was the only kind of alert available,
 * which forces people to guess a number and re-guess it whenever the market
 * moves. These types answer the questions people actually have:
 *
 *   price      "tell me when it drops below $X"        (the original)
 *   percent    "tell me when it drops 15% from where I saw it"
 *   restock    "tell me when it is buyable again"
 *   any_low    "tell me when it hits a 90-day low"
 *
 * Every type still respects the same cooldown, because the fastest way to make
 * someone disable alerts entirely is to send them the same one twice.
 */

export type AlertKind = "price" | "percent" | "restock" | "any_low";

export type EvalAlert = {
  id: string;
  tcg: string;
  group_key: string;
  product_name: string;
  email: string;
  /** Target price. Used by "price"; ignored by the others. */
  threshold: number;
  active: boolean;
  last_triggered: string | null;
  /** Defaults to "price" so alerts created before this existed keep working. */
  kind?: AlertKind;
  /** Percent drop that should fire a "percent" alert, e.g. 15 for 15%. */
  percent?: number;
  /** Price when the alert was created, the baseline a "percent" drop measures from. */
  baseline_price?: number;
  /** Whether the product was in stock when last seen, for "restock". */
  was_in_stock?: boolean;
};

export type EvalProduct = {
  group_key: string;
  name: string;
  price: number;
  retailer: string;
  url: string;
  in_stock: boolean;
  /** Lowest price seen in the tracked window. Needed by "any_low". */
  all_time_low?: number;
  /** Days of history behind that low — a low over three days means nothing. */
  history_days?: number;
};

export type TriggeredAlert = {
  alert: EvalAlert;
  product: EvalProduct;
  /** Why it fired, for the email body. */
  reason: string;
};

/** A "low" needs this much history behind it before it is worth an email. */
export const LOW_ALERT_MIN_DAYS = 14;

function alertKind(alert: EvalAlert): AlertKind {
  return alert.kind ?? "price";
}

/**
 * Decide whether one alert fires, and say why.
 *
 * Returns null rather than a boolean so the reason travels with the decision —
 * an alert email that cannot explain itself is indistinguishable from spam.
 */
function evaluateOne(alert: EvalAlert, product: EvalProduct): string | null {
  switch (alertKind(alert)) {
    case "price":
      if (!product.in_stock) return null;
      if (product.price > alert.threshold) return null;
      return `now $${product.price.toFixed(2)}, at or below your $${alert.threshold.toFixed(2)} target`;

    case "percent": {
      if (!product.in_stock) return null;
      const target = alert.percent;
      const baseline = alert.baseline_price;
      // Without a baseline there is nothing to measure a drop against, and
      // inventing one would fire on the first run for everything.
      if (!target || !baseline || baseline <= 0) return null;
      const drop = ((baseline - product.price) / baseline) * 100;
      if (drop < target) return null;
      return `down ${drop.toFixed(0)}% from $${baseline.toFixed(2)} to $${product.price.toFixed(2)}`;
    }

    case "restock":
      // Only interesting as a transition. Firing while it was already in stock
      // would send an email every run for anything permanently available.
      if (!product.in_stock) return null;
      if (alert.was_in_stock !== false) return null;
      return `back in stock at ${product.retailer} for $${product.price.toFixed(2)}`;

    case "any_low": {
      if (!product.in_stock) return null;
      const low = product.all_time_low;
      if (low === undefined || low <= 0) return null;
      if ((product.history_days ?? 0) < LOW_ALERT_MIN_DAYS) return null;
      if (product.price > low + 0.0001) return null;
      return `at its lowest tracked price, $${product.price.toFixed(2)}`;
    }

    default:
      return null;
  }
}

export function evaluateAlerts(
  alerts: EvalAlert[],
  productsByKey: Map<string, EvalProduct>,
  now: Date,
  cooldownHours = 24
): TriggeredAlert[] {
  const cooldownMs = cooldownHours * 3600 * 1000;
  const triggered: TriggeredAlert[] = [];

  for (const alert of alerts) {
    if (!alert.active) continue;
    const product = productsByKey.get(alert.group_key);
    if (!product) continue;

    if (alert.last_triggered) {
      const since = now.getTime() - new Date(alert.last_triggered).getTime();
      if (since < cooldownMs) continue;
    }

    const reason = evaluateOne(alert, product);
    if (!reason) continue;
    triggered.push({ alert, product, reason });
  }

  return triggered;
}
