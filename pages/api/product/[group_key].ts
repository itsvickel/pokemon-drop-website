import type { NextApiRequest, NextApiResponse } from "next";
import { getTcgConfig } from "../../../lib/tcg.config";
import { loadApiResponse } from "../../../lib/serverProducts";
import type { Product } from "../../../lib/products";

/**
 * One product, with its complete price history.
 *
 * The detail page previously fetched /api/products — the entire 6.8 MB catalogue
 * across 2,645 products — and then found the single record it needed. This
 * serves that record alone, which also lets the list endpoint ship trimmed
 * history without the detail view losing anything.
 *
 * The upstream feed is still loaded whole (it arrives as one JSON file), but the
 * response and the client-side parse are now proportional to what was asked for.
 */

type ErrorResponse = { error: string };

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; products: Product[] }>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ product: Product } | ErrorResponse>
) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const tcgParam = typeof req.query.tcg === "string" ? req.query.tcg : "pokemon";
  const groupKey = typeof req.query.group_key === "string" ? req.query.group_key : "";

  let config;
  try {
    config = getTcgConfig(tcgParam);
  } catch {
    return res.status(400).json({ error: `Invalid tcg param: "${tcgParam}"` });
  }
  if (!groupKey) return res.status(400).json({ error: "Missing product key" });

  const cached = cache.get(config.slug);
  const findIn = (products: Product[]) => products.find((p) => p.group_key === groupKey);

  if (cached && cached.expiresAt > Date.now()) {
    const hit = findIn(cached.products);
    if (hit) {
      res.setHeader("X-Cache", "hit");
      return res.status(200).json({ product: hit });
    }
    return res.status(404).json({ error: "Product not found — it may have been delisted." });
  }

  try {
    const feed = await loadApiResponse(config);
    cache.set(config.slug, { expiresAt: Date.now() + CACHE_TTL_MS, products: feed.products });
    const hit = findIn(feed.products);
    if (!hit) return res.status(404).json({ error: "Product not found — it may have been delisted." });
    return res.status(200).json({ product: hit });
  } catch (error) {
    console.error(`[api/product] ${config.slug}/${groupKey} failed:`, error);
    if (cached) {
      const hit = findIn(cached.products);
      if (hit) {
        res.setHeader("X-Cache", "stale");
        return res.status(200).json({ product: hit });
      }
    }
    return res.status(503).json({ error: "Product data temporarily unavailable" });
  }
}
