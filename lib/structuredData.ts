/**
 * structuredData.ts — schema.org JSON-LD.
 *
 * The site had none at all, which is why it never appeared in price-comparison
 * rich results. `Product` with an `AggregateOffer` is exactly what Google reads
 * to show a price range and retailer count next to a search result.
 *
 * Two rules shape everything here:
 *
 *   1. Only describe what we actually observed. Every field traces to real feed
 *      data — no invented ratings, no fabricated review counts, no brand we did
 *      not scrape. Structured data that overstates is a manual-action risk, not
 *      just a credibility one.
 *   2. Emit nothing rather than something hollow. A Product with no price is
 *      worse than no markup, so builders return null and callers skip the tag.
 */
import type { Product } from "./products";
import { absoluteUrl } from "./siteUrl";
import { SHIPPING_POLICIES } from "./shipping";

const CURRENCY = "CAD";

/** Retailers that do not price in Canadian dollars must not be aggregated. */
function cadOffers(product: Product): Array<{ retailer: string; price: number; url: string; inStock: boolean }> {
  const rows = [
    { retailer: product.retailer, price: product.price, url: product.url, inStock: product.in_stock },
    ...(product.other_retailers ?? []).map((r) => ({
      retailer: r.retailer, price: r.price, url: r.url, inStock: r.in_stock,
    })),
  ];
  return rows.filter((r) => r.price > 0 && !SHIPPING_POLICIES[r.retailer]?.foreign);
}

export function productJsonLd(product: Product, tcg: string): Record<string, unknown> | null {
  const offers = cadOffers(product);
  if (offers.length === 0) return null;

  const prices = offers.map((o) => o.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const url = absoluteUrl(`${tcg}/${product.group_key}`);

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    category: product.category === "single" ? "Trading Card" : "Sealed Trading Card Product",
  };

  if (product.image_url) node.image = product.image_url;
  if (product.set_name) {
    node.isRelatedTo = { "@type": "Thing", name: product.set_name };
  }

  node.offers = offers.length === 1
    ? {
        "@type": "Offer",
        price: low.toFixed(2),
        priceCurrency: CURRENCY,
        availability: offers[0].inStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        url: offers[0].url || url,
        seller: { "@type": "Organization", name: offers[0].retailer },
      }
    : {
        "@type": "AggregateOffer",
        priceCurrency: CURRENCY,
        lowPrice: low.toFixed(2),
        highPrice: high.toFixed(2),
        offerCount: offers.length,
        availability: offers.some((o) => o.inStock)
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        offers: offers.map((o) => ({
          "@type": "Offer",
          price: o.price.toFixed(2),
          priceCurrency: CURRENCY,
          url: o.url || url,
          availability: o.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          seller: { "@type": "Organization", name: o.retailer },
        })),
      };

  return node;
}

/** An ItemList for a listing page, so the set of products is legible as a set. */
export function itemListJsonLd(
  products: Product[],
  tcg: string,
  name: string
): Record<string, unknown> | null {
  const items = (products ?? []).filter((p) => p.price > 0).slice(0, 48);
  if (items.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`${tcg}/${p.group_key}`),
      name: p.name,
    })),
  };
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): Record<string, unknown> | null {
  if (!trail.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Serialise for embedding in a <script> tag. Escapes the sequence that would
 * otherwise let a product name containing "</script>" break out of the tag.
 */
export function jsonLdString(node: Record<string, unknown> | null): string | null {
  if (!node) return null;
  return JSON.stringify(node).replace(/</g, "\u003c");
}
