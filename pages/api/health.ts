import type { NextApiRequest, NextApiResponse } from "next";
import { fetchGameDataWithSource, type DataSource } from "../../lib/dataFetcher";
import type { SinglesEnrichmentJson } from "../../lib/products";

type RetailerHealth = {
  retailer: string;
  productCount: number;
  inStockCount: number;
  lastSeen: string | null;
};

type SinglesHealth = {
  matched: number;
  unmatched: number;
  generatedAt: string;
  ageHours: number;
};

type GameHealth = {
  tcg: string;
  retailerStats: RetailerHealth[];
  totalProducts: number;
  totalInStock: number;
  generatedAt: string;
  stateAge: string;
  dataSource: DataSource;
  singles: SinglesHealth | null;
};

type HealthResponse = {
  games: GameHealth[];
  fetchedAt: string;
};

type ErrorResponse = { error: string };

type StateRawProduct = {
  retailer: string;
  price: number;
  in_stock: boolean;
  last_seen: string;
};

type StateJson = {
  products?: Record<string, StateRawProduct>;
  generated_at?: string;
};

function buildSinglesHealth(enrichment: SinglesEnrichmentJson | null): SinglesHealth | null {
  if (!enrichment?.generated_at) return null;
  return {
    matched: enrichment.matched ?? 0,
    unmatched: enrichment.unmatched ?? 0,
    generatedAt: enrichment.generated_at,
    ageHours: Math.round((Date.now() - new Date(enrichment.generated_at).getTime()) / 3600000),
  };
}

function buildGameHealth(
  tcg: string,
  state: StateJson,
  dataSource: DataSource,
  singles: SinglesHealth | null
): GameHealth {
  const byRetailer = new Map<string, RetailerHealth>();

  for (const raw of Object.values(state.products ?? {})) {
    if (!raw.retailer || raw.price == null || raw.price < 3) continue;
    const existing = byRetailer.get(raw.retailer) ?? {
      retailer: raw.retailer,
      productCount: 0,
      inStockCount: 0,
      lastSeen: null,
    };
    existing.productCount++;
    if (raw.in_stock) existing.inStockCount++;
    if (!existing.lastSeen || (raw.last_seen && raw.last_seen > existing.lastSeen)) {
      existing.lastSeen = raw.last_seen ?? null;
    }
    byRetailer.set(raw.retailer, existing);
  }

  const retailerStats = Array.from(byRetailer.values()).sort(
    (a, b) => b.productCount - a.productCount
  );

  const totalProducts = retailerStats.reduce((s, r) => s + r.productCount, 0);
  const totalInStock  = retailerStats.reduce((s, r) => s + r.inStockCount, 0);

  const stateAge = state.generated_at
    ? Math.round((Date.now() - new Date(state.generated_at).getTime()) / 60000) + " min ago"
    : "unknown";

  return {
    tcg,
    retailerStats,
    totalProducts,
    totalInStock,
    generatedAt: state.generated_at ?? "",
    stateAge,
    dataSource,
    singles,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse | ErrorResponse>
) {
  const hasGithub = !!(process.env.GITHUB_REPO && process.env.GITHUB_TOKEN);
  const hasBlob   = !!process.env.BLOB_BASE_URL;

  if (!hasGithub && !hasBlob) {
    res.status(500).json({ error: "Missing GITHUB_REPO/GITHUB_TOKEN (or BLOB_BASE_URL)" });
    return;
  }

  try {
    const emptyState = { data: {} as StateJson, source: "github" as DataSource };
    const [pokemonState, mtgState, mtgEnrichment] = await Promise.all([
      fetchGameDataWithSource<StateJson>("", "state.json"),
      fetchGameDataWithSource<StateJson>("mtg", "state.json").catch(() => emptyState),
      fetchGameDataWithSource<SinglesEnrichmentJson>("mtg", "singles_enrichment.json")
        .then((r) => r.data)
        .catch(() => null),
    ]);

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    res.status(200).json({
      games: [
        buildGameHealth("pokemon", pokemonState.data, pokemonState.source, null),
        buildGameHealth("mtg", mtgState.data, mtgState.source, buildSinglesHealth(mtgEnrichment)),
      ],
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
}
