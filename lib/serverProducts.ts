/**
 * serverProducts.ts — server-side product feed loader shared by
 * /api/products and the /api/check-alerts cron.
 *
 * Reads Blob first (via dataFetcher), falls back to GitHub raw.
 */
import { fetchGameData } from "./dataFetcher";
import type { TcgConfig } from "./tcg.config";
import {
  toApiResponse,
  type ApiResponse,
  type StateJson,
  type HistoryJson,
  type StockChangesJson,
  type SinglesEnrichmentJson,
} from "./products";

async function fetchFromGitHubRaw<T>(repo: string, token: string, filePath: string): Promise<T> {
  const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed fetching ${filePath}: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`
    );
  }
  return response.json() as Promise<T>;
}

/**
 * Load and transform the full product feed for one game.
 * Throws when required files can't be fetched from any source.
 */
export async function loadApiResponse(config: TcgConfig): Promise<ApiResponse> {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const blobAvailable = !!process.env.BLOB_BASE_URL;

  if (!blobAvailable && (!repo || !token)) {
    throw new Error("Missing GITHUB_REPO or GITHUB_TOKEN environment variables.");
  }

  const p = config.githubDataPath;
  const gitPath = (file: string) => (p ? `${p}/${file}` : file);

  function loadRequired<T>(fileName: string): Promise<T> {
    if (blobAvailable) return fetchGameData<T>(p, fileName);
    return fetchFromGitHubRaw<T>(repo!, token!, gitPath(fileName));
  }

  function loadOptional<T>(fileName: string, fallback: T): Promise<T> {
    return loadRequired<T>(fileName).catch(() => fallback);
  }

  const [state, history, stockChanges, enrichment] = await Promise.all([
    loadRequired<StateJson>("state.json"),
    loadOptional<HistoryJson>("price_history.json", {}),
    loadOptional<StockChangesJson>("stock_changes.json", { events: [] }),
    loadOptional<SinglesEnrichmentJson | null>("singles_enrichment.json", null),
  ]);

  return toApiResponse(state, history, stockChanges, config, enrichment);
}
