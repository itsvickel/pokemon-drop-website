import { priceVerdict } from "../lib/insights";
import { SHIPPING_POLICIES } from "../lib/shipping";
import type { HistoryEntry } from "../lib/products";
import styles from "../styles/PriceVerdict.module.css";

/**
 * "Is this a good price?" answered against our own observed range.
 *
 * Deliberately not against MSRP: that field is null on all 4,391 products
 * because the configured reference retailers never appear in the scraped data.
 * Judging against observed history is both available and more honest — it is
 * what a human deal editor does by hand before promoting a deal.
 *
 * Also carries a currency warning, because two tracked retailers do not price
 * in Canadian dollars and a CAD-looking number from them would mislead.
 */

type Props = {
  price: number;
  history: HistoryEntry[] | undefined;
  retailer: string;
  compact?: boolean;
};

export default function PriceVerdict({ price, history, retailer, compact = false }: Props) {
  const policy = SHIPPING_POLICIES[retailer];
  const foreign = policy?.foreign ? policy.currency : null;
  const verdict = priceVerdict(price, history);

  if (foreign) {
    return (
      <span
        className={`${styles.badge} ${styles.foreign} ${compact ? styles.compact : ""}`}
        title={`${retailer} prices in ${foreign}, not Canadian dollars. Convert before comparing.`}
      >
        Priced in {foreign}
      </span>
    );
  }

  if (verdict.tone === "unknown") return null;

  return (
    <span
      className={`${styles.badge} ${styles[verdict.tone]} ${compact ? styles.compact : ""}`}
      title={verdict.detail}
    >
      {verdict.label}
    </span>
  );
}
