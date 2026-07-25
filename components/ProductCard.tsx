import { useState } from "react";
import Link from "next/link";
import Sparkline from "./Sparkline";
import ProductDetailModal from "./ProductDetailModal";
import styles from "../styles/Card.module.css";
import DealScoreBreakdown from "./DealScoreBreakdown";
import { SHIPPING_THRESHOLDS } from "../lib/shipping";
import { computePackCount } from "../lib/packCount";
import type { CardEnrichment } from "../lib/products";

type HistoryEntry = {
  date: string;
  price: number;
  retailer: string;
};

export type RetailerPrice = {
  retailer: string;
  price: number;
  url: string;
  in_stock: boolean;
  stock_qty: number | null;
};

export type Product = {
  group_key: string;
  name: string;
  price: number;
  retailer: string;
  url: string;
  is_preorder: boolean;
  updated: string;
  all_time_low: number;
  price_change_7d: number | null;
  history: HistoryEntry[];
  image_url: string;
  other_retailers: RetailerPrice[];
  is_new: boolean;
  in_stock: boolean;
  back_in_stock: boolean;
  language: string;
  product_type: string;
  set_name: string;
  variant: string;
  /** Optional so older cached API payloads without it keep rendering. */
  category?: "sealed" | "single";
  /** Scryfall card data — present only on enriched singles. */
  card?: CardEnrichment;
  msrp: number | null;
  deal_score: number;
  last_restock_date?: string | null;
};

type ProductCardProps = {
  product: Product;
  onRetailerClick?: (retailer: string) => void;
  activeRetailer?: string;
  isWishlisted?: boolean;
  onToggleWishlist?: (key: string) => void;
  isInComparison?: boolean;
  onToggleComparison?: (product: Product) => void;
  compareDisabled?: boolean;
  tcg?: string;
};


const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

function formatRestockAge(isoDate: string): string {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)  return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export function stripTrackingParams(input: string): string {
  try {
    const url = new URL(input);
    const params = url.searchParams;
    for (const key of [...params.keys()]) {
      if (key === "ref" || key.startsWith("utm_") || key === "fbclid" || key === "gclid") {
        params.delete(key);
      }
    }
    url.search = params.toString();
    return url.toString();
  } catch {
    return input;
  }
}

export function formatUpdatedDate(input: string): string {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getShippingThreshold(retailer: string): string {
  return SHIPPING_THRESHOLDS[retailer] ?? "Check site";
}

export default function ProductCard({
  product,
  onRetailerClick,
  activeRetailer,
  isWishlisted = false,
  onToggleWishlist,
  isInComparison = false,
  onToggleComparison,
  compareDisabled = false,
  tcg = "pokemon",
}: ProductCardProps) {
  const [showDetail, setShowDetail] = useState(false);

  const isAllTimeLow   = product.price <= product.all_time_low + 0.0001;
  const cleanUrl       = stripTrackingParams(product.url);
  const packCount      = computePackCount(product.name);
  const weeklyChange   = product.price_change_7d;
  const hasWeeklyChange = weeklyChange !== null;
  const isActiveFilter = activeRetailer === product.retailer;
  const isStale        = Date.now() - new Date(product.updated).getTime() > STALE_THRESHOLD_MS;

  const allRetailerStocks = [product.in_stock, ...product.other_retailers.map(r => r.in_stock)];
  const inStockCount    = allRetailerStocks.filter(Boolean).length;
  const totalRetailers  = allRetailerStocks.length;
  const soldOutEverywhere = inStockCount === 0;

  return (
    <>
      {/* Whole card is clickable — stop propagation on interactive children */}
      <article
        className={[
          styles.card,
          styles.cardClickable,
          isAllTimeLow         ? styles.allTimeLowCard    : "",
          product.is_preorder  ? styles.preorderTopBorder : "",
          soldOutEverywhere    ? styles.soldOutCard       : "",
        ].filter(Boolean).join(" ")}
        onClick={() => setShowDetail(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setShowDetail(true)}
        aria-label={`View details for ${product.name}`}
      >
        {/* Image */}
        <div className={styles.imageWrap}>
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className={styles.productImage}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden");
              }}
            />
          ) : null}
          <div
            className={styles.imagePlaceholder}
            hidden={!!product.image_url}
            aria-hidden="true"
          >
            <span className={styles.imagePlaceholderIcon}>
              {tcg === "mtg" ? "⚡" : "🔴"}
            </span>
            <span className={styles.imagePlaceholderType}>
              {product.product_type !== "Other" ? product.product_type : product.set_name || "Sealed Product"}
            </span>
          </div>
        </div>

        {/* Badges row + wishlist heart */}
        <div className={styles.cardTopRow}>
          <div className={styles.badges}>
            {product.is_new        && <span className={`${styles.badge} ${styles.badgeNew}`}>NEW</span>}
            {product.back_in_stock && <span className={`${styles.badge} ${styles.badgeBackInStock}`}>BACK IN STOCK</span>}
            {isAllTimeLow          && <span className={`${styles.badge} ${styles.badgeAllTimeLow}`}>ALL-TIME LOW</span>}
            {product.is_preorder   && <span className={`${styles.badge} ${styles.badgePreorder}`}>PRE-ORDER</span>}
            {hasWeeklyChange && weeklyChange! < 0 && (
              <span className={`${styles.badge} ${styles.badgeDrop}`}>
                {`↓${Math.abs(weeklyChange!).toFixed(0)}% this week`}
              </span>
            )}
            {hasWeeklyChange && weeklyChange! > 0 && (
              <span className={`${styles.badge} ${styles.badgeRise}`}>
                {`↑${Math.abs(weeklyChange!).toFixed(0)}%`}
              </span>
            )}
            {product.deal_score >= 40 && (
              <DealScoreBreakdown product={product} score={product.deal_score} compact />
            )}
          </div>
          {onToggleComparison && (
            <button
              className={`${styles.compareBtn} ${isInComparison ? styles.compareBtnActive : ""} ${compareDisabled && !isInComparison ? styles.compareBtnDisabled : ""}`}
              onClick={(e) => { e.stopPropagation(); onToggleComparison(product); }}
              type="button"
              disabled={compareDisabled && !isInComparison}
              aria-label={isInComparison ? "Remove from comparison" : "Add to comparison"}
              title={isInComparison ? "Remove from comparison" : compareDisabled ? "Max 3 products" : "Compare this product"}
            >
              {isInComparison ? "⊠" : "⊞"}
            </button>
          )}
          {onToggleWishlist && (
            <button
              className={`${styles.wishlistBtn} ${isWishlisted ? styles.wishlistBtnActive : ""}`}
              onClick={(e) => { e.stopPropagation(); onToggleWishlist(product.group_key); }}
              type="button"
              aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
              title={isWishlisted ? "Remove from My List" : "Save to My List"}
            >
              {isWishlisted ? "♥" : "♡"}
            </button>
          )}
        </div>

        {/* Name & price */}
        <h3 className={styles.productName}>{product.name}</h3>

        {/* Info chips: language · variant · product type · set */}
        <div className={styles.infoChips}>
          {product.language !== "English" && (
            <span className={`${styles.infoChip} ${styles.infoChipLang}`}>{product.language}</span>
          )}
          {product.variant && (
            <span className={`${styles.infoChip} ${styles.infoChipVariant}`}>{product.variant}</span>
          )}
          {product.product_type && product.product_type !== "Other" && (
            <span className={`${styles.infoChip} ${styles.infoChipType}`}>{product.product_type}</span>
          )}
          {product.set_name && (
            <span className={`${styles.infoChip} ${styles.infoChipSet}`}>{product.set_name}</span>
          )}
        </div>

        <p className={styles.price}>
          {`$${product.price.toFixed(2)} CAD`}
          {product.msrp !== null && product.msrp > product.price && (
            <span className={styles.msrpStrike} title="MSRP reference price">
              {`$${product.msrp.toFixed(2)}`}
            </span>
          )}
          {packCount && (
            <span className={styles.perPack}>
              {` · $${(product.price / packCount).toFixed(2)}/pack`}
            </span>
          )}
        </p>

        {!isAllTimeLow && (
          <p className={styles.lowNote}>
            {`All-time low: $${product.all_time_low.toFixed(2)} CAD`}
          </p>
        )}

        {/* Retailer + shipping */}
        <div className={styles.retailerRow}>
          <button
            className={`${styles.retailerChip} ${isActiveFilter ? styles.retailerChipActive : ""}`}
            onClick={(e) => { e.stopPropagation(); onRetailerClick?.(product.retailer); }}
            title={isActiveFilter ? `Remove filter: ${product.retailer}` : `Filter by ${product.retailer}`}
            type="button"
          >
            {product.retailer}
          </button>
          <span className={styles.shippingLabel}>{getShippingThreshold(product.retailer)}</span>
        </div>

        {/* Stock count + per-store breakdown */}
        {totalRetailers > 0 && (
          <div className={styles.stockInfoRow}>
            <div className={styles.stockHeader}>
              <span className={[
                styles.stockChip,
                soldOutEverywhere
                  ? styles.stockChipRed
                  : inStockCount / totalRetailers >= 0.5
                    ? styles.stockChipGreen
                    : styles.stockChipAmber,
              ].join(" ")}>
                {inStockCount}/{totalRetailers} stores in stock
              </span>
              {soldOutEverywhere && product.last_restock_date && (
                <span className={styles.lastRestockLabel}>
                  last in stock {formatRestockAge(product.last_restock_date)}
                </span>
              )}
            </div>
            <div className={styles.storeStockList}>
              {[
                { retailer: product.retailer, in_stock: product.in_stock },
                ...product.other_retailers.map(r => ({ retailer: r.retailer, in_stock: r.in_stock })),
              ].slice(0, 5).map(r => (
                <span
                  key={r.retailer}
                  className={`${styles.storeStockItem} ${r.in_stock ? styles.storeStockIn : styles.storeStockOut}`}
                >
                  {r.in_stock ? "●" : "○"} {r.retailer}
                </span>
              ))}
              {totalRetailers > 5 && (
                <span className={styles.storeStockMore}>+{totalRetailers - 5} more</span>
              )}
            </div>
          </div>
        )}

        <Sparkline points={product.history} />

        {/* Footer row */}
        <div className={styles.footerRow}>
          <span className={`${styles.updatedLabel} ${isStale ? styles.updatedStale : ""}`}>
            {isStale ? "⚠ " : ""}
            {`Updated ${formatUpdatedDate(product.updated)}`}
          </span>
          <div className={styles.footerActions} onClick={(e) => e.stopPropagation()}>
            <Link
              href={`/${tcg}/${product.group_key}`}
              className={styles.permalinkBtn}
              title="View product page"
            >
              ↗
            </Link>
            {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
            <a
              className={styles.buyButton}
              href={cleanUrl}
              target="_blank"
              rel="noreferrer"
            >
              Buy Now →
            </a>
          </div>
        </div>
      </article>

      {showDetail && (
        <ProductDetailModal product={product} tcg={tcg} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}
