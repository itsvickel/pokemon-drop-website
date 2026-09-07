import { discountCheck, priceVerdict, pricePercentile } from "../lib/insights";
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

  // "Cheaper than 91% of the last 90 days" is a far stronger claim than a badge,
  // and it is the same data either way.
  const percentile = pricePercentile(price, history);
  const stale = discountCheck(price, history);

  const detail = [
    verdict.detail,
    percentile !== null && percentile >= 60 ? `Cheaper than ${percentile}% of the last 90 days.` : null,
    stale.message,
  ].filter(Boolean).join(" ");

  return (
    <span className={styles.group}>
      <span
        className={`${styles.badge} ${styles[verdict.tone]} ${compact ? styles.compact : ""}`}
        title={detail}
      >
        {verdict.label}
      </span>
      {percentile !== null && percentile >= 75 && !compact && (
        <span className={styles.percentile} title={detail}>
          cheaper than {percentile}% of the last 90 days
        </span>
      )}
      {stale.suspicious && !compact && (
        <span className={styles.stale} title={stale.message ?? undefined}>
          unchanged {stale.daysAtPrice}d
        </span>
      )}
    </span>
  );
}
