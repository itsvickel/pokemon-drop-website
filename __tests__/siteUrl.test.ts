/**
 * The site origin used to be hardcoded in three places with two different
 * domains, both of which stopped resolving. These tests pin the normalisation
 * so a trailing slash or a bare hostname in the env var cannot produce a
 * malformed canonical tag or sitemap entry.
 *
 * SITE_URL is resolved at module load, so each case re-imports in isolation.
 */

function loadWith(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  let mod: typeof import("../lib/siteUrl");
  jest.isolateModules(() => {
    mod = require("../lib/siteUrl");
  });
  process.env = saved;
  return mod!;
}

const CLEAR = { NEXT_PUBLIC_SITE_URL: undefined, SITE_BASE_URL: undefined };

describe("SITE_URL", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    const { SITE_URL } = loadWith({ ...CLEAR, NEXT_PUBLIC_SITE_URL: "https://example.ca" });
    expect(SITE_URL).toBe("https://example.ca");
  });

  it("falls back to SITE_BASE_URL for server-only contexts", () => {
    const { SITE_URL } = loadWith({ ...CLEAR, SITE_BASE_URL: "https://server-only.ca" });
    expect(SITE_URL).toBe("https://server-only.ca");
  });

  it("strips trailing slashes so joined paths never double up", () => {
    const { SITE_URL, absoluteUrl } = loadWith({ ...CLEAR, NEXT_PUBLIC_SITE_URL: "https://example.ca///" });
    expect(SITE_URL).toBe("https://example.ca");
    expect(absoluteUrl("sitemap.xml")).toBe("https://example.ca/sitemap.xml");
  });

  it("adds a scheme to a bare hostname", () => {
    const { SITE_URL } = loadWith({ ...CLEAR, NEXT_PUBLIC_SITE_URL: "example.ca" });
    expect(SITE_URL).toBe("https://example.ca");
  });

  it("ignores an empty env var rather than producing a schemeless URL", () => {
    const { SITE_URL } = loadWith({ ...CLEAR, NEXT_PUBLIC_SITE_URL: "   " });
    expect(SITE_URL).toMatch(/^https:\/\/.+/);
  });

  it("defaults to a host that actually resolves", () => {
    const { SITE_URL } = loadWith(CLEAR);
    expect(SITE_URL).toBe("https://pokemon-drop-website.vercel.app");
  });
});

describe("absoluteUrl", () => {
  it("joins a leading-slash path without doubling", () => {
    const { absoluteUrl } = loadWith({ ...CLEAR, NEXT_PUBLIC_SITE_URL: "https://example.ca" });
    expect(absoluteUrl("/mtg/foo")).toBe("https://example.ca/mtg/foo");
    expect(absoluteUrl("mtg/foo")).toBe("https://example.ca/mtg/foo");
  });
});
