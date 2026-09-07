import crypto from "crypto";

/**
 * authToken.ts — short-lived signed links for viewing your own alerts.
 *
 * /api/manage-alerts previously returned a person's full alert and newsletter
 * state given nothing but an email address, so anyone could enumerate whether
 * an address was registered and read what it was tracking. These tokens close
 * that: the endpoint now needs proof that whoever is asking can receive mail at
 * the address they are asking about.
 *
 * Deliberately stateless — an HMAC over (email, expiry) rather than a row in a
 * table. There is nothing to store, nothing to clean up, and a leaked link stops
 * working on its own. The trade is that a token cannot be revoked early; given
 * the short lifetime and the low value of what it unlocks, that is the right
 * trade here.
 */

const SECRET =
  process.env.ALERT_TOKEN_SECRET ??
  process.env.ALERT_GITHUB_TOKEN ??
  process.env.GITHUB_TOKEN ??
  "";

/** Long enough to act on a link found later in the day, short enough to matter. */
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function tokensConfigured(): boolean {
  return SECRET.length >= 16;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** A token binding an email to an expiry: "<expiry>.<signature>". */
export function createToken(email: string, now: number = Date.now()): string {
  const expires = now + TOKEN_TTL_MS;
  const normalized = email.trim().toLowerCase();
  return `${expires}.${sign(`${normalized}:${expires}`)}`;
}

export type TokenCheck = { valid: boolean; reason?: "malformed" | "expired" | "bad-signature" | "unconfigured" };

export function verifyToken(email: string, token: string, now: number = Date.now()): TokenCheck {
  if (!tokensConfigured()) return { valid: false, reason: "unconfigured" };
  if (typeof token !== "string" || !token.includes(".")) return { valid: false, reason: "malformed" };

  const [expiresRaw, signature] = token.split(".", 2);
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || !signature) return { valid: false, reason: "malformed" };

  const normalized = email.trim().toLowerCase();
  const expected = sign(`${normalized}:${expires}`);

  // Compare before checking expiry, and with a length-safe constant-time
  // compare, so neither timing nor error text distinguishes "wrong signature"
  // from "expired" for an attacker probing addresses.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  const signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!signatureOk) return { valid: false, reason: "bad-signature" };
  if (expires < now) return { valid: false, reason: "expired" };
  return { valid: true };
}
