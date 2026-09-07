import type { GetStaticProps } from "next";
import { loadApiResponseCached } from "../../lib/serverProducts";
import { TCG_CONFIGS } from "../../lib/tcg.config";
import { leanForSsr, type Product } from "../../lib/products";

const SSR_SLICE = 24;

/**
 * Statically generated with ISR, embedding only the first SSR_SLICE products.
 *
 * The point is that a crawler sees real product names and prices instead of an
 * empty shell. The point is NOT to ship the catalogue twice: passing all of it
 * as props would inline 5.19 MB into __NEXT_DATA__, trading an invisible page
 * for an enormous one. SWR fetches the rest on mount for filtering.
 */
import ProductsPage from "../../components/ProductsPage";

type Props = {
  initialProducts: Product[];
  initialGeneratedAt: string;
  initialRetailersCount: number;
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  try {
    const feed = await loadApiResponseCached(TCG_CONFIGS.pokemon);
    const scoped = feed.products.filter((p) =>
      p.category !== "single"
    );
    return {
      props: {
        initialProducts: scoped.slice(0, SSR_SLICE).map(leanForSsr),
        initialGeneratedAt: feed.generated_at,
        initialRetailersCount: feed.retailers_count,
      },
      revalidate: 300,
    };
  } catch (err) {
    // Never fail the build or bake an error page over a transient data-repo
    // outage — render the shell and let the client fetch.
    console.error("[pokemon/sealed] getStaticProps failed:", err);
    return {
      props: { initialProducts: [], initialGeneratedAt: "", initialRetailersCount: 0 },
      revalidate: 60,
    };
  }
};

export default function PokemonSealedPage(props: Props) {
  return <ProductsPage tcg="pokemon" view="sealed" {...props} />;
}
