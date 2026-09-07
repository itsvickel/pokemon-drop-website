import { useEffect, useRef, useState } from "react";
import { confidenceBand, type Confidence } from "../lib/drops";
import styles from "../styles/ConfidenceBadge.module.css";

/**
 * A confidence percentage that can always explain itself.
 *
 * The number is only worth printing if the reader can see where it came from,
 * so the badge never appears without its breakdown one hover/tap away. Signals
 * are computed server-side in drops_core.py — this component renders them and
 * deliberately derives nothing of its own, which is what keeps the tooltip from
 * ever justifying a score the model did not produce.
 *
 * Follows the interaction pattern of DealScoreBreakdown: hover on pointer
 * devices, tap to toggle on touch, dismiss on outside press or Escape.
 */

type Props = {
  confidence: Confidence;
  /** Shown under the signals — the calibrated accuracy for this score band. */
  accuracyNote?: string;
  compact?: boolean;
};

export default function ConfidenceBadge({ confidence, accuracyNote, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!confidence) return null;

  const band = confidenceBand(confidence.score);
  const undated = band === "undated";
  const label = undated ? "No date yet" : `${confidence.score}%`;

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${compact ? styles.compact : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`${styles.badge} ${styles[band]}`}
        aria-expanded={open}
        aria-label={
          undated
            ? "No release date announced yet. Show details."
            : `${confidence.score} percent confidence in this date — ${confidence.label}. Show breakdown.`
        }
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <span className={styles.score}>{label}</span>
        {!undated && <span className={styles.tier}>{confidence.label}</span>}
      </button>

      {open && (
        <div className={styles.tooltip} role="tooltip">
          <p className={styles.tooltipTitle}>
            {undated ? "Not yet scheduled" : "How likely is this date?"}
          </p>
          {!undated && (
            <p className={styles.tooltipLede}>
              Our estimate that this drop lands on the stated date.
            </p>
          )}

          <ul className={styles.signals}>
            {(confidence.signals ?? []).map((signal, i) => (
              <li key={`${signal.label}-${i}`} className={styles.row}>
                <span className={styles.rowLabel}>{signal.label}</span>
                <span className={styles.rowValue}>{signal.value}</span>
                {signal.weight !== 0 && (
                  <span className={signal.weight > 0 ? styles.positive : styles.negative}>
                    {signal.weight > 0 ? `+${signal.weight}` : signal.weight}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {accuracyNote && <p className={styles.accuracy}>{accuracyNote}</p>}
        </div>
      )}
    </div>
  );
}
