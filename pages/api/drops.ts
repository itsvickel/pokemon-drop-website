import type { NextApiRequest, NextApiResponse } from "next";
import { getTcgConfig } from "../../lib/tcg.config";
import { fetchGameData } from "../../lib/dataFetcher";
import type { DropsResponse } from "../../lib/drops";

export type { DropsResponse } from "../../lib/drops";

const CACHE_TTL_MS = 3 * 60 * 1000;

type Entry = { expiresAt: number; data: DropsResponse };
const cache = new Map<string, Entry>();

const EMPTY: DropsResponse = {
  generated_at: "",
  attribution: [],
  calibration: [],
  drops: [],
  events: [],
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DropsResponse | { error: string }>
) {
  res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=600");

  const tcgParam = typeof req.query.tcg === "string" ? req.query.tcg : "pokemon";
  let config;
  try {
    config = getTcgConfig(tcgParam);
  } catch {
    return res.status(400).json({ error: `Invalid tcg param: "${tcgParam}"` });
  }

  const cached = cache.get(config.slug);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("X-Cache", "hit");
    return res.status(200).json(cached.data);
  }

  try {
    const data = await fetchGameData<DropsResponse>(config.githubDataPath, "drops.json");
    const normalized: DropsResponse = {
      ...EMPTY,
      ...data,
      drops: data?.drops ?? [],
      events: data?.events ?? [],
    };
    cache.set(config.slug, { expiresAt: Date.now() + CACHE_TTL_MS, data: normalized });
    res.setHeader("X-Cache", "miss");
    return res.status(200).json(normalized);
  } catch (err) {
    // An expired entry is still far better than an error page: the upstream is
    // a data repo that updates a few times a day, so minutes-old drops are
    // entirely usable. Only fail when there is nothing cached at all.
    if (cached) {
      res.setHeader("X-Cache", "stale");
      return res.status(200).json(cached.data);
    }
    // The feed is additive — a game with no drops.json yet is not an error.
    const message = err instanceof Error ? err.message : "unknown";
    if (/404|not found/i.test(message)) {
      cache.set(config.slug, { expiresAt: Date.now() + CACHE_TTL_MS, data: EMPTY });
      return res.status(200).json(EMPTY);
    }
    // Detail goes to the server log, never to the client: the underlying error
    // carries the data-repo URL and a slice of the upstream response body.
    console.error(`[api/drops] ${config.slug} failed:`, err);
    return res.status(503).json({ error: "Drops feed temporarily unavailable" });
  }
}
