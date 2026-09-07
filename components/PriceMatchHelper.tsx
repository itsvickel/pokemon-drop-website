import { useState } from "react";
import { priceMatchCases } from "../lib/priceMatch";
import type { Product } from "../lib/products";
import styles from "../styles/PriceMatch.module.css";

/**
 * Assembles a price-match request so the buyer does not have to.
 *
 * Many Canadian retailers will match a competitor, but the buyer has to gather
 * the store, the price, a link and the date themselves. That is thirty seconds
 * of tedium between someone and real money, and every piece is already here.
 *
 * The wording stays conditional — "if you price match" — because we do not
 * track which retailers actually have a policy, and asserting one they do not
 * have would embarrass the reader.
 */

type Props = { product: Product };

export default function PriceMatchHelper({ product }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const cases = priceMatchCases(product);

  if (cases.length === 0) return null;
  const best = cases[0];

  async function copy(text: string, retailer: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(retailer);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Clipboard blocked — the text is on screen and selectable anyway.
      setCopied(null);
    }
  }

  return (
    <section className={styles.wrap}>
      <h3 className={styles.title}>Ask for a price match</h3>
      <p className={styles.lede}>
        {best.askRetailer} is ${best.saving.toFixed(2)} dearer than {best.citeRetailer}, who has it
        in stock. If they price match, that is {best.savingPct}% off without changing where you buy.
      </p>

      <div className={styles.messageBox}>
        <p className={styles.message}>{best.message}</p>
        <button
          type="button"
          className={styles.copyBtn}
          onClick={() => { void copy(best.message, best.askRetailer); }}
        >
          {copied === best.askRetailer ? "Copied" : "Copy message"}
        </button>
      </div>

      {cases.length > 1 && (
        <ul className={styles.others}>
          {cases.slice(1).map((c) => (
            <li key={c.askRetailer} className={styles.other}>
              <span className={styles.otherName}>{c.askRetailer}</span>
              <span className={styles.otherSaving}>save ${c.saving.toFixed(2)}</span>
              <button
                type="button"
                className={styles.otherBtn}
                onClick={() => { void copy(c.message, c.askRetailer); }}
              >
                {copied === c.askRetailer ? "Copied" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.caveat}>
        We do not track which stores offer price matching — check their policy before asking.
      </p>
    </section>
  );
}
