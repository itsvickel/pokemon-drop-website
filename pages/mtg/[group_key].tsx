import type { GetStaticPaths, GetStaticProps } from "next";
import ProductDetailPage from "../../components/ProductDetailPage";
import { loadProduct } from "../../lib/serverProducts";
import { TCG_CONFIGS } from "../../lib/tcg.config";
import { leanForSsr, type Product } from "../../lib/products";

/**
 * Statically generated with ISR.
 *
 * These pages previously rendered entirely in the browser, so a crawler saw an
 * empty shell — while the sitemap advertised every one of them. That
 * combination reads as thin content across the whole catalogue.
 *
 * No paths are prerendered at build: there are thousands per game, and building
 * them all would make every deploy slow for pages nobody may visit.
 * fallback: "blocking" generates each on first request and serves it from cache
 * thereafter, so a crawler always receives fully rendered HTML.
 */
type Props = { product: Product | null; groupKey: string };

export default function MtgProductPage({ product, groupKey }: Props) {
  return <ProductDetailPage tcg="mtg" groupKey={groupKey} initialProduct={product} />;
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [],
  fallback: "blocking",
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const groupKey = typeof params?.group_key === "string" ? params.group_key : "";
  if (!groupKey) return { notFound: true };

  try {
    const product = await loadProduct(TCG_CONFIGS.mtg, groupKey);
    if (!product) return { notFound: true, revalidate: 300 };
    // leanForSsr also strips undefined keys, which getStaticProps rejects.
    return { props: { product: leanForSsr(product), groupKey }, revalidate: 300 };
  } catch (err) {
    // A data-repo outage must not bake a 404 into the cache. Render the shell,
    // let the client fetch, and retry the build again shortly.
    console.error("[mtg/group_key] getStaticProps failed:", err);
    return { props: { product: null, groupKey }, revalidate: 60 };
  }
};
