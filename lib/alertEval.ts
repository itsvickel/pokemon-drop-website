/**
 * alertEval.ts — pure price-alert evaluation, shared by the /api/check-alerts
 * Vercel cron. Kept free of I/O so it can be unit tested.
 */

export type EvalAlert = {
  id: string;
  tcg: string;
  group_key: string;
  product_name: string;
  email: string;
  threshold: number;
  active: boolean;
  last_triggered: string | null;
};

export type EvalProduct = {
  group_key: string;
  name: string;
  price: number;
  retailer: string;
  url: string;
  in_stock: boolean;
};

export type TriggeredAlert = {
  alert: EvalAlert;
  product: EvalProduct;
};

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
    if (!product.in_stock) continue;
    if (product.price > alert.threshold) continue;
    if (alert.last_triggered) {
      const since = now.getTime() - new Date(alert.last_triggered).getTime();
      if (since < cooldownMs) continue;
    }
    triggered.push({ alert, product });
  }

  return triggered;
}
