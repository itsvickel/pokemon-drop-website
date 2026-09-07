import { useState } from "react";
import Link from "next/link";
import { useSavedSearches } from "../hooks/useSavedSearches";
import { MAX_NAME_LENGTH } from "../lib/savedSearches";
import styles from "../styles/SavedSearches.module.css";

/**
 * Save the current filters under a name, and jump back to them later.
 *
 * Only shown once filters are actually active — offering to save "everything,
 * unfiltered" is offering to bookmark the page you are on.
 */

type Props = {
  /** Current path plus query, i.e. exactly what should be restored. */
  href: string;
  tcg: string;
  activeFilterCount: number;
};

export default function SavedSearches({ href, tcg, activeFilterCount }: Props) {
  const saved = useSavedSearches();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!saved.hydrated) return null;

  const forThisGame = saved.forGame(tcg);
  const alreadySaved = saved.has(href);

  function commit(e: React.FormEvent) {
    e.preventDefault();
    saved.save(name, href, tcg);
    setName("");
    setNaming(false);
  }

  if (forThisGame.length === 0 && activeFilterCount === 0) return null;

  return (
    <section className={styles.wrap} aria-label="Saved searches">
      {forThisGame.length > 0 && (
        <ul className={styles.list}>
          {forThisGame.map((s) => (
            <li key={s.id} className={styles.item}>
              <Link href={s.href} className={styles.link}>{s.name}</Link>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove saved search "${s.name}"`}
                onClick={() => saved.remove(s.id)}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeFilterCount > 0 && !alreadySaved && (
        naming ? (
          <form className={styles.form} onSubmit={commit}>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this search"
              aria-label="Name this search"
              autoFocus
              maxLength={MAX_NAME_LENGTH}
            />
            <button type="submit" className={styles.save}>Save</button>
            <button type="button" className={styles.cancel} onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className={styles.saveBtn} onClick={() => setNaming(true)}>
            Save these {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </button>
        )
      )}

      {activeFilterCount > 0 && alreadySaved && (
        <span className={styles.savedNote}>Saved</span>
      )}
    </section>
  );
}
