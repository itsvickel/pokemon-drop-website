import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import useSWR from "swr";
import ProductCard, { Product } from "./ProductCard";
import ProductDetailModal from "./ProductDetailModal";
import Footer from "./Footer";
import GameTabBar from "./GameTabBar";
import GameSubNav, { type GameSection } from "./GameSubNav";
import NewsletterSignup from "./NewsletterSignup";
import { useWishlist } from "../hooks/useWishlist";
import styles from "../styles/Home.module.css";
import HotStrip from "./HotStrip";
import CompareModal, { CompareBar } from "./CompareModal";
import { TCG_CONFIGS, type TcgSlug } from "../lib/tcg.config";
import { LOW_LABEL, LOW_LABEL_TITLE, UPDATE_CADENCE, retailerClaim } from "../lib/siteFacts";
import { deliveredSortKey } from "../lib/shipping";
import { itemListJsonLd, jsonLdString } from "../lib/structuredData";
import { absoluteUrl } from "../lib/siteUrl";
import { useCollection } from "../hooks/useCollection";

type ApiResponse = {
  products: Product[];
  generated_at: string;
  retailers_count: number;
};

type SortOption = "price_asc" | "delivered" | "price_desc" | "drop" | "atl_pct" | "deal" | "updated" | "name";
const VALID_SORTS: SortOption[] = ["price_asc", "delivered", "price_desc", "drop", "atl_pct", "deal", "updated", "name"];

const REFRESH_MS = 5 * 60 * 1000;
const PAGE_SIZE  = 48;

const fetcher = async (url: string): Promise<ApiResponse> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch products");
  return response.json() as Promise<ApiResponse>;
};

function byUpdatedDesc(a: Product, b: Product): number {
  return new Date(b.updated).getTime() - new Date(a.updated).getTime();
}

function byLargestDrop(a: Product, b: Product): number {
  const aDrop = a.price_change_7d ?? Number.POSITIVE_INFINITY;
  const bDrop = b.price_change_7d ?? Number.POSITIVE_INFINITY;
  return aDrop - bDrop;
}

function byAllTimeLowPct(a: Product, b: Product): number {
  const aPct = a.all_time_low > 0 ? (a.price - a.all_time_low) / a.all_time_low : 0;
  const bPct = b.all_time_low > 0 ? (b.price - b.all_time_low) / b.all_time_low : 0;
  return aPct - bPct;
}

// The listed price is not the price paid: a cheaper item from a retailer with a
// high free-shipping threshold can cost more delivered than a dearer one that
// ships free. Where the delivered cost is unknown we fall back to the listed
// price rather than penalising the retailer for not publishing a policy.
function byDeliveredPrice(a: Product, b: Product): number {
  return deliveredSortKey(a.price, a.retailer) - deliveredSortKey(b.price, b.retailer);
}

function byDealScore(a: Product, b: Product): number {
  return b.deal_score - a.deal_score;
}

function isAtAllTimeLow(product: Product): boolean {
  return product.price <= product.all_time_low + 0.0001;
}

type Props = {
  tcg: TcgSlug;
  view?: GameSection;
  /**
   * A small slice of the catalogue rendered on the server so crawlers see real
   * products and prices instead of an empty shell.
   *
   * Deliberately NOT the whole feed: that is 5.19 MB, and passing it as props
   * would inline all of it into the HTML as __NEXT_DATA__ — trading an invisible
   * page for an enormous one. SWR still fetches the full list for filtering.
   */
  initialProducts?: Product[];
  initialGeneratedAt?: string;
  initialRetailersCount?: number;
};

export default function ProductsPage({
  tcg,
  view = "sealed",
  initialProducts,
  initialGeneratedAt,
  initialRetailersCount,
}: Props) {
  const config  = TCG_CONFIGS[tcg];
  const router  = useRouter();
  const wishlist = useWishlist();
  const collection = useCollection();

  // Only offered when accounts are configured and the visitor is signed in —
  // otherwise the button would lead somewhere they cannot use.
  const handleAddToCollection = collection.signedIn
    ? (product: Product) => {
        void collection.add({
          group_key: product.group_key,
          product_name: product.name,
          tcg,
          quantity: 1,
          unit_cost: null,
          purchased_at: null,
        });
      }
    : undefined;

  // Apply game-specific theme to <html> for CSS var inheritance
  useEffect(() => {
    document.documentElement.setAttribute("data-tcg", tcg);
    return () => { document.documentElement.removeAttribute("data-tcg"); };
  }, [tcg]);
  const [autoAlertProduct, setAutoAlertProduct] = useState<Product | null>(null);
  const [hotProduct, setHotProduct] = useState<Product | null>(null);
  const pendingAlertKey = useRef<string | null>(null);

  const fallbackData = initialProducts
    ? {
        products: initialProducts,
        generated_at: initialGeneratedAt ?? "",
        retailers_count: initialRetailersCount ?? 0,
      }
    : undefined;

  const { data, error, isLoading } = useSWR<ApiResponse>(`/api/products?tcg=${tcg}`, fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
    // Seeds the first render from the server slice, then revalidates to the
    // full catalogue so filters and counts operate on everything.
    fallbackData,
    revalidateOnMount: true,
  });
  // SWR keeps isLoading true while it revalidates, even when fallbackData has
  // already given us products to show. Gating the grid on it would hide the
  // server-rendered slice behind a skeleton and defeat the whole point.
  const showSkeleton = isLoading && !(data?.products?.length);


  // ── Filter state ─────────────────────────────────────────────────────────
  const [query,         setQuery]         = useState("");
  const [sort,          setSort]          = useState<SortOption>("price_asc");
  const [retailer,      setRetailer]      = useState<string>("all");
  const [language,      setLanguage]      = useState<string>("all");
  const [productType,   setProductType]   = useState<string>("all");
  const [setName,       setSetName]       = useState<string>("all");
  const [priceMin,      setPriceMin]      = useState<string>("");
  const [priceMax,      setPriceMax]      = useState<string>("");
  const [inStockOnly,   setInStockOnly]   = useState(false);
  const [hidePreorders, setHidePreorders] = useState(false);
  const [dealsOnly,     setDealsOnly]     = useState(view === "deals");
  const [lowOnly,       setLowOnly]       = useState(false);
  const [newOnly,       setNewOnly]       = useState(false);
  const [wishlistOnly,  setWishlistOnly]  = useState(false);
  const [visibleCount,  setVisibleCount]  = useState(PAGE_SIZE);
  const [urlReady,      setUrlReady]      = useState(false);
  const [compareList,  setCompareList]  = useState<Product[]>([]);
  const [showCompare,  setShowCompare]  = useState(false);

  // ── Sync from URL on first load ──────────────────────────────────────────
  useEffect(() => {
    if (!router.isReady) return;
    const { q, s, r, lang, type, set, pmin, pmax, stock, p, d, l, n, w, alert: alertParam } = router.query;
    if (typeof q    === "string") setQuery(q);
    if (typeof s    === "string" && VALID_SORTS.includes(s as SortOption)) setSort(s as SortOption);
    if (typeof r    === "string") setRetailer(r);
    if (typeof lang === "string") setLanguage(lang);
    if (typeof type === "string") setProductType(type);
    if (typeof set  === "string") setSetName(set);
    if (typeof pmin === "string") setPriceMin(pmin);
    if (typeof pmax === "string") setPriceMax(pmax);
    if (stock === "1") setInStockOnly(true);
    if (p     === "1") setHidePreorders(true);
    if (d     === "1") setDealsOnly(true);
    if (l     === "1") setLowOnly(true);
    if (n     === "1") setNewOnly(true);
    if (w     === "1") setWishlistOnly(true);
    if (typeof alertParam === "string") pendingAlertKey.current = alertParam;
    setUrlReady(true);
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Write filters back to URL ────────────────────────────────────────────
  useEffect(() => {
    if (!urlReady) return;
    const params: Record<string, string> = {};
    if (query)              params.q     = query;
    if (sort !== "price_asc")   params.s = sort;
    if (retailer !== "all")     params.r = retailer;
    if (language !== "all")     params.lang  = language;
    if (productType !== "all")  params.type  = productType;
    if (setName !== "all")      params.set   = setName;
    if (priceMin)           params.pmin  = priceMin;
    if (priceMax)           params.pmax  = priceMax;
    if (inStockOnly)        params.stock = "1";
    if (hidePreorders)      params.p     = "1";
    if (dealsOnly)          params.d     = "1";
    if (lowOnly)            params.l     = "1";
    if (newOnly)            params.n     = "1";
    if (wishlistOnly)       params.w     = "1";
    if (compareList.length > 0) params.compare = compareList.map((p) => p.group_key).join(",");
    void router.replace({ query: params }, undefined, { shallow: true });
  }, [query, sort, retailer, language, productType, setName, priceMin, priceMax, // eslint-disable-line react-hooks/exhaustive-deps
      inStockOnly, hidePreorders, dealsOnly, lowOnly, newOnly, wishlistOnly, urlReady, compareList]);

  const allProducts = data?.products ?? [];

  // ── Sealed / Singles view split ──────────────────────────────────────────
  // Older cached payloads may lack `category`; treat those as sealed.
  const singlesCount = useMemo(
    () => allProducts.filter((p) => p.category === "single").length,
    [allProducts]
  );
  const sealedCount = allProducts.length - singlesCount;
  const products = useMemo(
    () =>
      view === "singles"
        ? allProducts.filter((p) => p.category === "single")
        : allProducts.filter((p) => p.category !== "single"),
    [allProducts, view]
  );

  // ── Auto-open detail modal from ?alert=group_key ─────────────────────────
  useEffect(() => {
    if (!pendingAlertKey.current || allProducts.length === 0) return;
    const match = allProducts.find((p) => p.group_key === pendingAlertKey.current);
    if (match) {
      setAutoAlertProduct(match);
      pendingAlertKey.current = null;
    }
  }, [allProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore compare list from URL once products are loaded
  useEffect(() => {
    if (!router.isReady || allProducts.length === 0) return;
    const raw = router.query.compare;
    if (typeof raw !== "string" || !raw) return;
    const keys = raw.split(",").filter(Boolean);
    const matched = keys
      .map((k) => allProducts.find((p) => p.group_key === k))
      .filter((p): p is Product => p !== undefined)
      .slice(0, 3);
    if (matched.length > 0) setCompareList(matched);
  }, [router.isReady, allProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset pagination whenever any filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, sort, retailer, language, productType, setName, priceMin, priceMax,
      inStockOnly, hidePreorders, dealsOnly, lowOnly, newOnly, wishlistOnly]);

  // ── Dropdown option lists (derived from loaded products) ─────────────────
  const retailers = useMemo(
    () => Array.from(new Set(products.map((p) => p.retailer))).sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const retailerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) counts[p.retailer] = (counts[p.retailer] ?? 0) + 1;
    return counts;
  }, [products]);

  const languages = useMemo(
    () => Array.from(new Set(products.map((p) => p.language).filter(Boolean))).sort(),
    [products]
  );

  const languageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) if (p.language) counts[p.language] = (counts[p.language] ?? 0) + 1;
    return counts;
  }, [products]);

  const productTypes = useMemo(
    () =>
      Array.from(new Set(products.map((p) => p.product_type).filter((t) => Boolean(t) && t !== "Other"))).sort(),
    [products]
  );

  const productTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) if (p.product_type && p.product_type !== "Other") counts[p.product_type] = (counts[p.product_type] ?? 0) + 1;
    return counts;
  }, [products]);

  const setNames = useMemo(
    () => Array.from(new Set(products.map((p) => p.set_name).filter(Boolean))).sort(),
    [products]
  );

  const setNameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) if (p.set_name) counts[p.set_name] = (counts[p.set_name] ?? 0) + 1;
    return counts;
  }, [products]);

  // MTG-only: sets that have commander decks, sorted by count desc, with avg price
  const commanderSets = useMemo(() => {
    if (tcg !== "mtg") return [];
    const setData: Record<string, { count: number; totalPrice: number }> = {};
    for (const p of products) {
      if (p.product_type === "Commander Deck" && p.set_name) {
        const d = setData[p.set_name] ?? { count: 0, totalPrice: 0 };
        d.count++;
        d.totalPrice += p.price;
        setData[p.set_name] = d;
      }
    }
    return Object.entries(setData)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, { count, totalPrice }]) => ({
        name,
        count,
        avgPrice: Math.round(totalPrice / count),
      }));
  }, [tcg, products]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const deals      = products.filter((p) => p.price_change_7d !== null && p.price_change_7d <= -5).length;
    const allTimeLow = products.filter((p) => isAtAllTimeLow(p)).length;
    const isNew      = products.filter((p) => p.is_new).length;
    return {
      totalProducts: products.length,
      deals,
      allTimeLow,
      isNew,
      retailers: new Set(products.map((p) => p.retailer)).size,
    };
  }, [products]);

  // ── Filtered + sorted products ───────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let next = [...products];

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      next = next.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (retailer    !== "all") next = next.filter((p) => p.retailer    === retailer);
    if (language    !== "all") next = next.filter((p) => p.language    === language);
    if (productType !== "all") next = next.filter((p) => p.product_type === productType);
    if (setName     !== "all") next = next.filter((p) => p.set_name    === setName);
    if (inStockOnly)           next = next.filter((p) => p.in_stock);
    if (hidePreorders)         next = next.filter((p) => !p.is_preorder);
    if (dealsOnly)             next = next.filter((p) => p.price_change_7d !== null && p.price_change_7d <= -5);
    if (lowOnly)               next = next.filter((p) => isAtAllTimeLow(p));
    if (newOnly)               next = next.filter((p) => p.is_new);
    if (wishlistOnly)          next = next.filter((p) => wishlist.has(p.group_key));

    const minP = priceMin ? parseFloat(priceMin) : null;
    const maxP = priceMax ? parseFloat(priceMax) : null;
    if (minP !== null && !isNaN(minP)) next = next.filter((p) => p.price >= minP);
    if (maxP !== null && !isNaN(maxP)) next = next.filter((p) => p.price <= maxP);

    switch (sort) {
      case "delivered":  next.sort(byDeliveredPrice); break;
      case "price_desc": next.sort((a, b) => b.price - a.price); break;
      case "drop":       next.sort(byLargestDrop); break;
      case "atl_pct":    next.sort(byAllTimeLowPct); break;
      case "deal":       next.sort(byDealScore); break;
      case "updated":    next.sort(byUpdatedDesc); break;
      case "name":       next.sort((a, b) => a.name.localeCompare(b.name)); break;
      default:           next.sort((a, b) => a.price - b.price);
    }

    return next;
  }, [products, query, retailer, language, productType, setName, priceMin, priceMax,
      inStockOnly, hidePreorders, dealsOnly, lowOnly, newOnly, wishlistOnly, wishlist, sort]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore         = visibleCount < filteredProducts.length;
  const remaining       = filteredProducts.length - visibleCount;

  const activeFilterCount = [
    query, retailer !== "all", language !== "all", productType !== "all",
    setName !== "all", priceMin, priceMax, inStockOnly, hidePreorders,
    dealsOnly, lowOnly, newOnly, wishlistOnly,
  ].filter(Boolean).length;

  function handleRetailerClick(name: string) {
    setRetailer((prev) => (prev === name ? "all" : name));
  }

  function clearFilters() {
    setQuery("");
    setRetailer("all");
    setLanguage("all");
    setProductType("all");
    setSetName("all");
    setPriceMin("");
    setPriceMax("");
    setInStockOnly(false);
    setHidePreorders(false);
    setDealsOnly(false);
    setLowOnly(false);
    setNewOnly(false);
    setWishlistOnly(false);
  }

  function toggleCompare(product: Product) {
    setCompareList((prev) => {
      const exists = prev.some((p) => p.group_key === product.group_key);
      if (exists) return prev.filter((p) => p.group_key !== product.group_key);
      if (prev.length >= 3) return prev;
      return [...prev, product];
    });
  }

  const viewNoun = view === "singles" ? "singles" : "sealed product";

  // Describes the first screen of results as a list, so the page is legible to
  // a crawler as a set of products rather than an undifferentiated blob.
  const listJsonLd = jsonLdString(
    itemListJsonLd(visibleProducts, tcg, `${config.displayName} ${viewNoun}`)
  );
  const viewTitle =
    view === "singles" ? `${config.displayName} Singles Price Tracker`
    : view === "deals" ? `${config.displayName} Deals — Price Drops`
    : `${config.displayName} Price Tracker`;

  return (
    <>
      <Head>
        <title>{`${viewTitle} — Best Canadian Prices`}</title>
        <meta
          name="description"
          content={`Track live ${config.displayName} ${viewNoun} prices across ${retailerClaim(data?.retailers_count)} Canadian retailers. Compare prices and find the best deals. Updated ${UPDATE_CADENCE}.`}
        />
        <meta property="og:title" content={`${viewTitle} — Best Canadian Prices`} />
        <meta
          property="og:description"
          content={`Live ${config.displayName} ${viewNoun} prices across ${retailerClaim(data?.retailers_count)} Canadian retailers. Always find the best deal.`}
        />
        {/* Every filter combination pushes params into the URL, so without a
            self-referencing canonical each one is a separate indexable copy of
            the same page. Filtered views are additionally noindexed: they are
            useful to share, not to rank. */}
        <link rel="canonical" href={absoluteUrl(`${tcg}/${view}`)} />
        {activeFilterCount > 0 && <meta name="robots" content="noindex, follow" />}
        {listJsonLd && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listJsonLd }} />
        )}
      </Head>

      {/* ── Game tab bar + section sub-nav ────────────────────────────────── */}
      <GameTabBar tcg={tcg} />
      <GameSubNav
        tcg={tcg}
        active={view}
        sealedCount={data ? sealedCount : undefined}
        singlesCount={data ? singlesCount : undefined}
      />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroGameBadge}>
            <span>{tcg === "mtg" ? "⚡" : "🔴"}</span>
            {config.shortName} Price Tracker
          </div>
          <h1 className={styles.heroTitle}>{config.displayName}</h1>
          <p className={styles.heroTagline}>
            Track {viewNoun} prices across {stats.retailers || data?.retailers_count || 20}+ Canadian retailers.
            Prices updated automatically every 3 hours.
          </p>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <strong>{stats.totalProducts.toLocaleString()}</strong>
              <span>Products tracked</span>
            </div>
            <div className={`${styles.heroStat} ${styles.heroStatGreen}`}>
              <strong>{stats.deals}</strong>
              <span>Deals this week</span>
            </div>
            <div className={`${styles.heroStat} ${styles.heroStatGreen}`}>
              <strong>{stats.allTimeLow}</strong>
              <span>At {LOW_LABEL}</span>
            </div>
            <div className={styles.heroStat}>
              <strong>{stats.retailers || data?.retailers_count}</strong>
              <span>Retailers</span>
            </div>
          </div>
          <NewsletterSignup />
        </div>
      </section>

      <div className={styles.page}>
        {/* ── Sticky context bar ──────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>{config.displayName}</h2>
            <span className={styles.subtitle}>Live Canadian pricing</span>
          </div>
          <div className={styles.headerRight}>
            {data?.generated_at && (() => {
              const syncedAt = new Date(data.generated_at);
              const ageH = (Date.now() - syncedAt.getTime()) / (1000 * 60 * 60);
              const isStale = ageH > 2;
              return (
                <span className={`${styles.syncChip} ${isStale ? styles.syncChipStale : ""}`}>
                  {isStale ? "⚠ " : ""}
                  {syncedAt.toLocaleString("en-CA", {
                    timeZone: "America/Toronto",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              );
            })()}
            {activeFilterCount > 0 && (
              <button
                className={styles.clearFiltersBtn}
                onClick={clearFilters}
                type="button"
              >
                ✕ {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </header>

        {/* ── Stats bar ───────────────────────────────────────────────────── */}
        <section className={styles.statsBar}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Products</span>
            <strong>{stats.totalProducts.toLocaleString()}</strong>
          </div>
          <div className={`${styles.statCard} ${styles.statCardGreen}`}>
            <span className={styles.statLabel}>Deals (7d drop)</span>
            <strong>{stats.deals}</strong>
          </div>
          <div className={`${styles.statCard} ${styles.statCardGreen}`}>
            <span className={styles.statLabel}>{LOW_LABEL_TITLE}</span>
            <strong>{stats.allTimeLow}</strong>
          </div>
          <div className={`${styles.statCard} ${styles.statCardBlue}`}>
            <span className={styles.statLabel}>New This Week</span>
            <strong>{stats.isNew}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Retailers</span>
            <strong>{data?.retailers_count ?? stats.retailers}</strong>
          </div>
        </section>

        {/* ── Hot strip ──────────────────────────────────────────────────── */}
        {products.length > 0 && (
          <HotStrip products={products} onSelect={setHotProduct} />
        )}

        {/* ── Controls ────────────────────────────────────────────────────── */}
        <section className={styles.controls}>

          {/* Row 1: search · sort · retailer */}
          <div className={styles.controlsRow1}>
            <input
              className={`${styles.controlInput} ${styles.controlSearch}`}
              type="text"
              placeholder="Search products…"
              aria-label="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className={styles.controlInput}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              aria-label="Sort order"
            >
              <option value="price_asc">Price ↑ Low to High</option>
              <option value="delivered">Cheapest Delivered</option>
              <option value="price_desc">Price ↓ High to Low</option>
              <option value="drop">Biggest 7-Day Drop</option>
              <option value="deal">Best Deal Score</option>
              <option value="atl_pct">Closest to {LOW_LABEL_TITLE}</option>
              <option value="updated">Recently Updated</option>
              <option value="name">Name A–Z</option>
            </select>
            <select
              className={`${styles.controlInput} ${styles.controlRetailer}`}
              value={retailer}
              onChange={(e) => setRetailer(e.target.value)}
              aria-label="Filter by retailer"
            >
              <option value="all">All retailers</option>
              {retailers.map((r) => (
                <option key={r} value={r}>
                  {r}{retailerCounts[r] ? ` (${retailerCounts[r]})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: language · product type · set · price range */}
          <div className={styles.controlsRow2}>
            <select
              className={styles.controlInput}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Filter by language"
            >
              <option value="all">All languages</option>
              {languages.map((l) => (
                <option key={l} value={l}>{l}{languageCounts[l] ? ` (${languageCounts[l]})` : ""}</option>
              ))}
            </select>
            <select
              className={styles.controlInput}
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              aria-label="Filter by product type"
            >
              <option value="all">All product types</option>
              {productTypes.map((t) => (
                <option key={t} value={t}>{t}{productTypeCounts[t] ? ` (${productTypeCounts[t]})` : ""}</option>
              ))}
            </select>
            <select
              className={`${styles.controlInput} ${styles.controlSet}`}
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              aria-label="Filter by set"
            >
              <option value="all">All sets / expansions</option>
              {setNames.map((s) => (
                <option key={s} value={s}>{s}{setNameCounts[s] ? ` (${setNameCounts[s]})` : ""}</option>
              ))}
            </select>
            <div className={styles.priceRange}>
              <span className={styles.priceRangeLabel}>$</span>
              <input
                className={styles.priceInput}
                type="number"
                min="0"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                aria-label="Minimum price"
              />
              <span className={styles.priceRangeSep}>–</span>
              <input
                className={styles.priceInput}
                type="number"
                min="0"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                aria-label="Maximum price"
              />
            </div>
          </div>

          {/* Row 3: toggles + clear */}
          <div className={styles.controlsRow3}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              In stock
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={hidePreorders}
                onChange={(e) => setHidePreorders(e.target.checked)}
              />
              Hide pre-orders
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={dealsOnly}
                onChange={(e) => setDealsOnly(e.target.checked)}
              />
              Deals only
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
              />
              All-time low only
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={newOnly}
                onChange={(e) => setNewOnly(e.target.checked)}
              />
              New arrivals
            </label>
            <label className={`${styles.toggle} ${styles.toggleWishlist}`}>
              <input
                type="checkbox"
                checked={wishlistOnly}
                onChange={(e) => setWishlistOnly(e.target.checked)}
              />
              ♥ My List{wishlist.count > 0 ? ` (${wishlist.count})` : ""}
            </label>
            {activeFilterCount > 0 && (
              <button
                className={styles.clearFiltersBtn}
                onClick={clearFilters}
                type="button"
              >
                ✕ Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </section>

        {/* ── MTG Commander Decks quick-filter ────────────────────────────── */}
        {commanderSets.length > 0 && (
          <section className={styles.commanderStrip}>
            <span className={styles.commanderLabel}>Commander Decks:</span>
            {commanderSets.map(({ name, count, avgPrice }) => {
              const isActive = productType === "Commander Deck" && setName === name;
              return (
                <button
                  key={name}
                  className={`${styles.commanderChip} ${isActive ? styles.commanderChipActive : ""}`}
                  onClick={() => {
                    if (isActive) {
                      setProductType("all");
                      setSetName("all");
                    } else {
                      setProductType("Commander Deck");
                      setSetName(name);
                    }
                  }}
                  type="button"
                  title={`${name} Commander Decks (${count})`}
                >
                  {name} <span className={styles.commanderCount}>{count}</span><span className={styles.commanderAvgPrice}>${avgPrice}</span>
                </button>
              );
            })}
          </section>
        )}

        {/* ── Results header ───────────────────────────────────────────────── */}
        <section className={styles.resultsHeader}>
          <h2>
            {`Showing ${visibleProducts.length} of ${filteredProducts.length} product${filteredProducts.length !== 1 ? "s" : ""}`}
          </h2>
        </section>

        {error && (
          <p className={styles.errorText}>Could not load products right now. Will retry shortly.</p>
        )}

        {/* ── Grid ────────────────────────────────────────────────────────── */}
        {showSkeleton ? (
          <section className={styles.grid}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard} aria-hidden="true" />
            ))}
          </section>
        ) : filteredProducts.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>
              {wishlistOnly && wishlist.count === 0
                ? "Your list is empty"
                : "No products match your filters"}
            </p>
            <p className={styles.emptyHint}>
              {wishlistOnly && wishlist.count === 0
                ? "Click the ♡ on any product card to save it here."
                : "Try adjusting the search or clearing some filters."}
            </p>
            <button className={styles.clearButton} onClick={clearFilters}>
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <section className={styles.grid}>
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.group_key}
                  onAddToCollection={handleAddToCollection}
                  product={product}
                  tcg={tcg}
                  onRetailerClick={handleRetailerClick}
                  activeRetailer={retailer}
                  isWishlisted={wishlist.hydrated ? wishlist.has(product.group_key) : false}
                  onToggleWishlist={wishlist.toggle}
                  isInComparison={compareList.some((p) => p.group_key === product.group_key)}
                  onToggleComparison={toggleCompare}
                  compareDisabled={compareList.length >= 3}
                />
              ))}
            </section>

            {hasMore && (
              <div className={styles.loadMoreWrap}>
                <button
                  className={styles.loadMoreButton}
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                >
                  {`Show ${Math.min(remaining, PAGE_SIZE)} more  (${remaining} remaining)`}
                </button>
              </div>
            )}
          </>
        )}

        {autoAlertProduct && (
          <ProductDetailModal
            product={autoAlertProduct}
            tcg={tcg}
            autoOpenAlert={true}
            onClose={() => setAutoAlertProduct(null)}
          />
        )}
        {hotProduct && (
          <ProductDetailModal
            product={hotProduct}
            tcg={tcg}
            onClose={() => setHotProduct(null)}
          />
        )}
        <CompareBar
          products={compareList}
          onRemove={(key) => setCompareList((prev) => prev.filter((p) => p.group_key !== key))}
          onCompare={() => setShowCompare(true)}
          onClear={() => { setCompareList([]); setShowCompare(false); }}
        />

        {showCompare && compareList.length > 0 && (
          <CompareModal
            products={compareList}
            onClose={() => setShowCompare(false)}
            onRemove={(key) => {
              const next = compareList.filter((p) => p.group_key !== key);
              setCompareList(next);
              if (next.length === 0) setShowCompare(false);
            }}
          />
        )}

        <Footer
          syncedAt={data?.generated_at ?? null}
          retailersCount={data?.retailers_count ?? stats.retailers}
          productsCount={stats.totalProducts}
        />
      </div>
    </>
  );
}
