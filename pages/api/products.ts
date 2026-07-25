import type { NextApiRequest, NextApiResponse } from "next";
import { getTcgConfig } from "../../lib/tcg.config";
import { loadApiResponse } from "../../lib/serverProducts";
import type { ApiResponse } from "../../lib/products";

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
    const payload = await loadApiResponse(config);
    responseCache.set(config.slug, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ error: message });
  }
}
