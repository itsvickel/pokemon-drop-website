import Link from "next/link";
import type { SetProgress as Row } from "../lib/setCompletion";
import styles from "../styles/SetProgress.module.css";

/**
 * How far through each set the collection is.
 *
 * Only shown for sets with more than one card held — one card from a set is a
 * card you happen to own, not a set you are collecting, and listing every such
 * set would bury the ones that matter.
 */

/** A single stray card is not evidence of collecting a set. */
const MIN_OWNED_TO_SHOW = 2;
/** Enough to see progress at a glance without turning the page into a list. */
const MAX_ROWS = 8;

export default function SetProgressPanel({ rows }: { rows: Row[] }) {
  const shown = rows.filter((r) => r.owned >= MIN_OWNED_TO_SHOW).slice(0, MAX_ROWS);
  if (shown.length === 0) return null;

  const anyEstimated = shown.some((r) => !r.totalIsComplete);

  return (
    <section className={styles.wrap} aria-labelledby="set-progress-heading">
      <h2 id="set-progress-heading" className={styles.heading}>Set progress</h2>

      <ul className={styles.list}>
        {shown.map((row) => (
          <li key={row.setCode} className={styles.row}>
            <div className={styles.top}>
              <Link href={`/mtg/singles?set=${encodeURIComponent(row.setName)}`} className={styles.name}>
                {row.setName}
              </Link>
              <span className={styles.count}>
                {row.owned}<span className={styles.slash}>/</span>{row.total}
                {!row.totalIsComplete && <span className={styles.asterisk} aria-hidden="true">*</span>}
              </span>
            </div>

            <div
              className={styles.bar}
              role="progressbar"
              aria-valuenow={row.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.setName}: ${row.owned} of ${row.total} cards`}
            >
              <span className={styles.fill} style={{ width: `${row.percent}%` }} />
            </div>

            <div className={styles.bottom}>
              <span className={styles.percent}>{row.percent}%</span>
              <span className={styles.value}>
                ${row.marketValue.toFixed(2)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {anyEstimated && (
        // The two denominators mean very different things, and quietly mixing
        // them would let someone think a set was nearly done when it is not.
        <p className={styles.footnote}>
          * counted against the cards we track for this set, not the full set —
          we could not confirm its size.
        </p>
      )}
    </section>
  );
}
