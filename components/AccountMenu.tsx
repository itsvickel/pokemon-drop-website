import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../hooks/useAuth";
import { getSavedEmail, saveEmail } from "../lib/savedEmail";
import styles from "../styles/AccountMenu.module.css";

/**
 * Sign-in button / signed-in menu for the tab bar.
 * Renders nothing when Supabase auth is not configured.
 */
export default function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmail(getSavedEmail());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!auth.enabled || auth.loading) return null;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    const err = await auth.signIn(trimmed);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    saveEmail(trimmed);
    setSent(true);
  }

  if (auth.user) {
    return (
      <div className={styles.wrap} ref={wrapRef}>
        <button
          className={styles.avatarBtn}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          type="button"
          title={auth.user.email}
        >
          {auth.user.email[0].toUpperCase()}
        </button>
        {open && (
          <div className={styles.menu} role="menu">
            <span className={styles.menuEmail}>{auth.user.email}</span>
            <Link href="/account" className={styles.menuItem} role="menuitem">
              Account
            </Link>
            <Link
              href={`/alerts?email=${encodeURIComponent(auth.user.email)}`}
              className={styles.menuItem}
              role="menuitem"
            >
              My alerts
            </Link>
            <button
              className={`${styles.menuItem} ${styles.menuButton}`}
              onClick={() => { void auth.signOut(); setOpen(false); }}
              role="menuitem"
              type="button"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={styles.signInBtn}
        onClick={() => { setOpen((v) => !v); setSent(false); setError(""); }}
        aria-expanded={open}
        type="button"
      >
        Sign in
      </button>
      {open && (
        <div className={styles.menu}>
          {sent ? (
            <p className={styles.sentNote}>
              Magic link sent — check <strong>{email.trim()}</strong> and open the link on this
              device.
            </p>
          ) : (
            <form onSubmit={handleSignIn} className={styles.form}>
              <p className={styles.formNote}>
                Sync your list &amp; alerts across devices. No password — we email you a sign-in
                link.
              </p>
              <input
                className={styles.emailInput}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email address"
                autoFocus
              />
              {error && <span className={styles.error}>{error}</span>}
              <button className={styles.submitBtn} type="submit" disabled={busy}>
                {busy ? "Sending…" : "Email me a link"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
