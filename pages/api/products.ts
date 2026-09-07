import type { NextApiRequest, NextApiResponse } from "next";
import { getTcgConfig } from "../../lib/tcg.config";
import { loadApiResponse } from "../../lib/serverProducts";
import { slimProduct, type ApiResponse } from "../../lib/products";

export type {
  RetailerPrice,
  Product,
  ApiResponse,
} from "../../lib/products";

type ErrorResponse = {
  error: string;
};

type CacheItem = {
  expiresAt: number;
  payload: ApiResponse;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, CacheItem>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse | ErrorResponse>
) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");

  const tcgParam = typeof req.query.tcg === "string" ? req.query.tcg : "pokemon";
  let config;
  try {
    config = getTcgConfig(tcgParam);
  } catch {
    res.status(400).json({ error: `Invalid tcg param: "${tcgParam}"` });
    return;
  }

  const cached = responseCache.get(config.slug);
  if (cached && cached.expiresAt > Date.now()) {
    res.status(200).json(cached.payload);
    return;
  }

  try {
    const full = await loadApiResponse(config);
    // Price history was 59% of this response and the grid can only draw its
    // tail, so the list ships a trimmed slice. `?full=1` opts out, and
    // /api/product/[group_key] serves the complete series for one product.
    const payload: ApiResponse = req.query.full === "1"
      ? full
      : { ...full, products: full.products.map(slimProduct) };
    responseCache.set(config.slug, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    res.status(200).json(payload);
  } catch (error) {
    // Detail carries the data-repo URL and part of the upstream body, so it is
    // logged rather than returned. Stale beats broken when the repo is down.
    console.error(`[api/products] ${config.slug} failed:`, error);
    if (cached) {
      res.setHeader("X-Cache", "stale");
      res.status(200).json(cached.payload);
      return;
    }
    res.status(503).json({ error: "Product feed temporarily unavailable" });
  }
}
