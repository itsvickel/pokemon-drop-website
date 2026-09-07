/**
 * The endpoint these guard used to return a person's full alert and newsletter
 * state given nothing but an email address. These tests pin the properties that
 * make the replacement actually safe.
 */
process.env.ALERT_TOKEN_SECRET = "test-secret-at-least-sixteen-chars";

import { TOKEN_TTL_MS, createToken, tokensConfigured, verifyToken } from "../lib/authToken";

const EMAIL = "someone@example.com";

describe("token configuration", () => {
  it("reports configured with a long enough secret", () => {
    expect(tokensConfigured()).toBe(true);
  });
});

describe("createToken / verifyToken", () => {
  it("accepts a token it just issued", () => {
    expect(verifyToken(EMAIL, createToken(EMAIL)).valid).toBe(true);
  });

  it("is case- and whitespace-insensitive about the address", () => {
    const token = createToken("  SomeOne@Example.COM ");
    expect(verifyToken(EMAIL, token).valid).toBe(true);
  });

  it("refuses a token issued for a different address", () => {
    // The whole point: a token must not be replayable against another account.
    const token = createToken("attacker@example.com");
    expect(verifyToken(EMAIL, token).valid).toBe(false);
  });

  it("refuses an expired token", () => {
    const issued = Date.now() - TOKEN_TTL_MS - 1000;
    const token = createToken(EMAIL, issued);
    expect(verifyToken(EMAIL, token).valid).toBe(false);
    expect(verifyToken(EMAIL, token).reason).toBe("expired");
  });

  it("accepts a token that has not quite expired", () => {
    const issued = Date.now() - TOKEN_TTL_MS + 60_000;
    expect(verifyToken(EMAIL, createToken(EMAIL, issued)).valid).toBe(true);
  });

  it("refuses a token whose expiry has been extended by hand", () => {
    // Signature covers the expiry, so moving it invalidates the token.
    const token = createToken(EMAIL);
    const [, sig] = token.split(".");
    const forged = `${Date.now() + 10 * TOKEN_TTL_MS}.${sig}`;
    expect(verifyToken(EMAIL, forged).valid).toBe(false);
    expect(verifyToken(EMAIL, forged).reason).toBe("bad-signature");
  });

  it("refuses a tampered signature", () => {
    const token = createToken(EMAIL);
    const [exp, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyToken(EMAIL, `${exp}.${flipped}`).valid).toBe(false);
  });

  it("refuses malformed input rather than throwing", () => {
    for (const bad of ["", "nonsense", "...", "abc.def", "9999"]) {
      expect(() => verifyToken(EMAIL, bad)).not.toThrow();
      expect(verifyToken(EMAIL, bad).valid).toBe(false);
    }
  });

  it("reports bad-signature, not expired, for a wrong signature on an old token", () => {
    // Failure modes must not let an attacker distinguish "right address, stale
    // link" from "wrong address" while probing.
    const stale = createToken("other@example.com", Date.now() - TOKEN_TTL_MS - 1000);
    expect(verifyToken(EMAIL, stale).reason).toBe("bad-signature");
  });

  it("issues different tokens for different addresses", () => {
    const a = createToken("a@example.com", 1_700_000_000_000);
    const b = createToken("b@example.com", 1_700_000_000_000);
    expect(a).not.toEqual(b);
  });
});
