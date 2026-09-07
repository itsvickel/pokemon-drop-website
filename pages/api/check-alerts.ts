/**
 * /api/check-alerts — Vercel cron endpoint (see vercel.json).
 *
 * Reads active price alerts from Supabase `user_alerts`, compares them
 * against the latest product feed, sends trigger emails via Resend, and
 * stamps last_triggered so each alert fires at most once per cooldown.
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "../../lib/supabase";
import { loadApiResponse } from "../../lib/serverProducts";
import { SITE_URL } from "../../lib/siteUrl";
import { getTcgConfig, TCG_CONFIGS } from "../../lib/tcg.config";
import { evaluateAlerts, type EvalAlert, type EvalProduct, type TriggeredAlert } from "../../lib/alertEval";

const COOLDOWN_HOURS = 24;

async function sendAlertEmail(hit: TriggeredAlert, siteBase: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.RESEND_FROM ?? "TCG Drop <onboarding@resend.dev>";
  const { alert, product } = hit;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: alert.email,
      subject: `Price alert: ${product.name.slice(0, 60)} — $${product.price.toFixed(2)} CAD`,
      html: `
        <p><strong>${product.name}</strong> just hit <strong>$${product.price.toFixed(2)} CAD</strong>
        at ${product.retailer} (your target: $${alert.threshold.toFixed(2)}).</p>
        <p><a href="${product.url}">Buy now at ${product.retailer}</a></p>
        <p style="color:#888;font-size:12px">
          Manage alerts: <a href="${siteBase}/alerts?email=${encodeURIComponent(alert.email)}">${siteBase}/alerts</a>
        </p>`,
    }),
  });
  return res.ok;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getServiceSupabase();
  if (!db) {
    return res.status(200).json({ skipped: "Supabase service credentials not configured" });
  }

  const { data: alertRows, error } = await db
    .from("user_alerts")
    .select("id, tcg, group_key, product_name, email, threshold, active, last_triggered")
    .eq("active", true);

  if (error) {
    return res.status(500).json({ error: `Supabase read failed: ${error.message}` });
  }

  const alerts = (alertRows ?? []) as EvalAlert[];
  if (alerts.length === 0) {
    return res.status(200).json({ checked: 0, triggered: 0 });
  }

  // Load each game's feed once
  const tcgs = Array.from(new Set(alerts.map((a) => a.tcg))).filter((t) => t in TCG_CONFIGS);
  const productsByTcg = new Map<string, Map<string, EvalProduct>>();
  for (const tcg of tcgs) {
    try {
      const feed = await loadApiResponse(getTcgConfig(tcg));
      productsByTcg.set(
        tcg,
        new Map(feed.products.map((p) => [p.group_key, {
          group_key: p.group_key,
          name: p.name,
          price: p.price,
          retailer: p.retailer,
          url: p.url,
          in_stock: p.in_stock,
        }]))
      );
    } catch (err) {
      console.error(`[check-alerts] failed loading ${tcg} feed:`, err);
    }
  }

  const now = new Date();
  const siteBase = SITE_URL;
  let triggeredCount = 0;
  let emailFailures = 0;

  for (const [tcg, productsByKey] of productsByTcg) {
    const gameAlerts = alerts.filter((a) => a.tcg === tcg);
    const hits = evaluateAlerts(gameAlerts, productsByKey, now, COOLDOWN_HOURS);

    for (const hit of hits) {
      const sent = await sendAlertEmail(hit, siteBase);
      if (!sent) {
        emailFailures++;
        continue;
      }
      triggeredCount++;
      const { error: updateError } = await db
        .from("user_alerts")
        .update({ last_triggered: now.toISOString() })
        .eq("id", hit.alert.id);
      if (updateError) {
        console.error(`[check-alerts] failed stamping ${hit.alert.id}:`, updateError.message);
      }
    }
  }

  return res.status(200).json({
    checked: alerts.length,
    triggered: triggeredCount,
    emailFailures,
  });
}
