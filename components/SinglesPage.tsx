import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import useSWR from "swr";
import type { Product } from "./ProductCard";
import ProductDetailModal from "./ProductDetailModal";
import ImageLightbox from "./ImageLightbox";
import Footer from "./Footer";
import GameTabBar from "./GameTabBar";
import GameSubNav from "./GameSubNav";
import { useWishlist } from "../hooks/useWishlist";
import { TCG_CONFIGS, type TcgSlug } from "../lib/tcg.config";
import styles from "../styles/Singles.module.css";

type ApiResponse = {
  products: Product[];
  generated_at: string;
  retailers_count: number;
};

type SortOption = "below_market" | "price_asc" | "price_desc" | "drop" | "name";
const VALID_SORTS: SortOption[] = ["below_market", "price_asc", "price_desc", "drop", "name"];

const REFRESH_MS = 5 * 60 * 1000;
const PAGE_SIZE = 48;

const fetcher = async (url: string): Promise<ApiResponse> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch products");
  return response.json() as Promise<ApiResponse>;
};

/** % the store price sits above (+) or below (−) Scryfall market, or null. */
export function marketDeltaPct(p: Product): number | null {
  const market = p.card?.market_cad;
  if (market == null || market <= 0) return null;
  return ((p.price - market) / market) * 100;
}

function treatmentOf(p: Product): string {
  return p.card?.treatment ?? (p.variant || "Non-Foil");
}

function setNameOf(p: Product): string {
  return p.card?.set_name || p.set_name || "Unknown set";
}

type Props = { tcg: TcgSlug };

export default function SinglesPage({ tcg }: Props) {
  const config = TCG_CONFIGS[tcg];
  const router = useRouter();
  const wishlist = useWishlist();

  useEffect(() => {
    document.documentElement.setAttribute("data-tcg", tcg);
    return () => { document.documentElement.removeAttribute("data-tcg"); };
  }, [tcg]);

  const { data, error, isLoading } = useSWR<ApiResponse>(`/api/products?tcg=${tcg}`, fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
  });

  const [query, setQuery] = useState("");
  const [treatment, setTreatment] = useState<string>("all");
  const [setName, setSetName] = useState<string>("all");
  const [sort, setSort] = useState<SortOption>("below_market");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Product | null>(null);
  const [zoomed, setZoomed] = useState<Product | null>(null);
  const [urlReady, setUrlReady] = useState(false);

  // ── URL state (read once, then write back) ───────────────────────────────
  useEffect(() => {
    if (!router.isReady) return;
    const { q, t, set, s, stock } = router.query;
    if (typeof q === "string") setQuery(q);
    if (typeof t === "string") setTreatment(t);
    if (typeof set === "string") setSetName(set);
    if (typeof s === "string" && VALID_SORTS.includes(s as SortOption)) setSort(s as SortOption);
    if (stock === "1") setInStockOnly(true);
    setUrlReady(true);
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!urlReady) return;
    const params: Record<string, string> = {};
    if (query) params.q = query;
    if (treatment !== "all") params.t = treatment;
    if (setName !== "all") params.set = setName;
    if (sort !== "below_market") params.s = sort;
    if (inStockOnly) params.stock = "1";
    void router.replace({ query: params }, undefined, { shallow: true });
  }, [query, treatment, setName, sort, inStockOnly, urlReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, treatment, setName, sort, inStockOnly]);

  const allProducts = data?.products ?? [];
  const singles = useMemo(
    () => allProducts.filter((p) => p.category === "single"),
    [allProducts]
  );
  const sealedCount = allProducts.length - singles.length;

  const retailerCount = useMemo(
    () => new Set(singles.map((p) => p.retailer)).size,
    [singles]
  );
  const enrichedCount = useMemo(() => singles.filter((p) => p.card).length, [singles]);

  // ── Filter option lists ──────────────────────────────────────────────────
  const treatments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of singles) {
      const t = treatmentOf(p);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [singles]);

  const setNames = useMemo(
    () => Array.from(new Set(singles.map(setNameOf))).sort(),
    [singles]
  );

  // ── Filtered + sorted ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let next = [...singles];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      next = next.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.card?.card_name ?? "").toLowerCase().includes(q)
      );
    }
    if (treatment !== "all") next = next.filter((p) => treatmentOf(p) === treatment);
    if (setName !== "all") next = next.filter((p) => setNameOf(p) === setName);
    if (inStockOnly) next = next.filter((p) => p.in_stock);

    switch (sort) {
      case "price_asc": next.sort((a, b) => a.price - b.price); break;
      case "price_desc": next.sort((a, b) => b.price - a.price); break;
      case "name": next.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "drop": {
        // MAX_SAFE_INTEGER (not Infinity) keeps the comparator finite when both are null
        next.sort((a, b) =>
          (a.price_change_7d ?? Number.MAX_SAFE_INTEGER) - (b.price_change_7d ?? Number.MAX_SAFE_INTEGER));
        break;
      }
      default: {
        // % below market — best deals first, cards without market data last
        next.sort((a, b) =>
          (marketDeltaPct(a) ?? Number.MAX_SAFE_INTEGER) - (marketDeltaPct(b) ?? Number.MAX_SAFE_INTEGER));
      }
    }
    return next;
  }, [singles, query, treatment, setName, inStockOnly, sort]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <>
      <Head>
        <title>{`${config.displayName} Singles — Canadian Store Prices vs Market`}</title>
        <meta
          name="description"
          content={`Search ${config.displayName} single cards priced in CAD across Canadian stores, compared against Scryfall market prices.`}
        />
      </Head>

      <GameTabBar tcg={tcg} />
      <GameSubNav
        tcg={tcg}
        active="singles"
        sealedCount={data ? sealedCount : undefined}
        singlesCount={data ? singles.length : undefined}
      />

      {/* ── Search-first hero ─────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>
          {config.shortName} <em>singles</em>, priced in CAD
        </h1>
        <p className={styles.heroSub}>
          {singles.length.toLocaleString()} cards tracked across {retailerCount} Canadian stores
          {enrichedCount > 0 && <> · market reference via Scryfall ({enrichedCount.toLocaleString()} matched)</>}
        </p>
        <input
          className={styles.bigSearch}
          type="search"
          placeholder={`Search cards — try "Blood Crypt" or "Counterspell"…`}
          aria-label="Search singles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      <div className={styles.page}>
        {/* ── Filters ───────────────────────────────────────────────────── */}
        <section className={styles.filters}>
          <div className={styles.chipRow}>
            <button
              className={`${styles.chip} ${treatment === "all" ? styles.chipActive : ""}`}
              onClick={() => setTreatment("all")}
              type="button"
            >
              All treatments
            </button>
            {treatments.map(([t, count]) => (
              <button
                key={t}
                className={`${styles.chip} ${treatment === t ? styles.chipActive : ""}`}
                onClick={() => setTreatment((prev) => (prev === t ? "all" : t))}
                type="button"
              >
                {t !== "Non-Foil" && "✨ "}{t} <span className={styles.chipCount}>{count}</span>
              </button>
            ))}
          </div>
          <div className={styles.controlRow}>
            <select
              className={styles.select}
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              aria-label="Filter by set"
            >
              <option value="all">All sets</option>
              {setNames.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className={styles.select}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              aria-label="Sort order"
            >
              <option value="below_market">% below market</option>
              <option value="price_asc">Price ↑ Low to High</option>
              <option value="price_desc">Price ↓ High to Low</option>
              <option value="drop">Biggest 7-Day Drop</option>
              <option value="name">Name A–Z</option>
            </select>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              In stock
            </label>
            <span className={styles.resultCount}>
              {filtered.length.toLocaleString()} card{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </section>

        {error && (
          <p className={styles.errorText}>Could not load singles right now. Will retry shortly.</p>
        )}

        {/* ── Card grid ─────────────────────────────────────────────────── */}
        {isLoading ? (
          <section className={styles.grid}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={styles.skeleton} aria-hidden="true" />
            ))}
          </section>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {singles.length === 0
                ? `No ${config.shortName} singles tracked yet`
                : "No cards match your search"}
            </p>
            <p className={styles.emptyHint}>
              {singles.length === 0
                ? "Singles appear here automatically once stores list them."
                : "Try a different name or clear the filters."}
            </p>
          </div>
        ) : (
          <>
            <section className={styles.grid}>
              {visible.map((p) => {
                const delta = marketDeltaPct(p);
                const t = treatmentOf(p);
                const isFoil = t !== "Non-Foil";
                return (
                  <article
                    key={p.group_key}
                    className={styles.card}
                    onClick={() => setSelected(p)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelected(p); }}
                    tabIndex={0}
                    role="button"
                    aria-label={p.card?.card_name ?? p.name}
                  >
                    <div className={styles.artWrap}>
                      <span className={`${styles.treatChip} ${isFoil ? styles.treatChipFoil : ""}`}>
                        {t}
                      </span>
                      <button
                        className={`${styles.heart} ${wishlist.has(p.group_key) ? styles.heartOn : ""}`}
                        onClick={(e) => { e.stopPropagation(); wishlist.toggle(p.group_key); }}
                        aria-label={wishlist.has(p.group_key) ? "Remove from list" : "Save to list"}
                        type="button"
                      >
                        {wishlist.hydrated && wishlist.has(p.group_key) ? "♥" : "♡"}
                      </button>
                      {p.card?.image_url || p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className={styles.art}
                          src={p.card?.image_url || p.image_url}
                          alt=""
                          loading="lazy"
                          style={{ cursor: "zoom-in" }}
                          title="Click to zoom"
                          onClick={(e) => { e.stopPropagation(); setZoomed(p); }}
                        />
                      ) : (
                        <div className={styles.artFallback}>🃏</div>
                      )}
                      {isFoil && <span className={styles.foilSheen} aria-hidden="true" />}
                    </div>
                    <div className={styles.cardBody}>
                      <h3 className={styles.cardName}>{p.card?.card_name ?? p.name}</h3>
                      <span className={styles.cardSet}>
                        {setNameOf(p)}
                        {p.card?.collector_number && <> · #{p.card.collector_number}</>}
                      </span>
                      <div className={styles.priceRow}>
                        <strong className={styles.price}>${p.price.toFixed(2)}</strong>
                        {delta !== null && (
                          <span
                            className={`${styles.delta} ${delta <= 0 ? styles.deltaBelow : styles.deltaAbove}`}
                            title={p.card?.approximate ? "Approximate printing match" : undefined}
                          >
                            {delta <= 0
                              ? `${Math.abs(delta).toFixed(0)}% below market`
                              : `${delta.toFixed(0)}% above market`}
                            {p.card?.approximate ? " ~" : ""}
                          </span>
                        )}
                      </div>
                      {p.card?.market_cad != null && (
                        <span className={styles.market}>
                          Market US${p.card.market_usd?.toFixed(2)} ≈ C${p.card.market_cad.toFixed(2)}
                        </span>
                      )}
                      <span className={styles.store}>
                        {p.retailer} · {p.in_stock ? "in stock" : "out of stock"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </section>

            {hasMore && (
              <div className={styles.loadMoreWrap}>
                <button
                  className={styles.loadMore}
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  type="button"
                >
                  Show more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}

        {selected && (
          <ProductDetailModal product={selected} tcg={tcg} onClose={() => setSelected(null)} />
        )}
        {zoomed && (
          <ImageLightbox
            src={(zoomed.card?.image_url || zoomed.image_url).replace("/normal/", "/large/")}
            alt={zoomed.card?.card_name ?? zoomed.name}
            onClose={() => setZoomed(null)}
          />
        )}

        <Footer
          syncedAt={data?.generated_at ?? null}
          retailersCount={data?.retailers_count ?? retailerCount}
          productsCount={singles.length}
        />
      </div>
    </>
  );
}
