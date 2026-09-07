import type { GetServerSideProps } from "next";
import { absoluteUrl } from "../lib/siteUrl";

/**
 * robots.txt as a route rather than a static file, so the Sitemap line follows
 * NEXT_PUBLIC_SITE_URL like every other absolute URL on the site. As a static
 * file it hardcoded a domain that no longer resolves, which pointed crawlers at
 * a dead sitemap.
 *
 * Disallowed paths are per-user or operational pages with nothing to index.
 */
const DISALLOW = ["/health", "/account", "/alerts", "/unsubscribe", "/wishlist"];

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const body = [
    "User-agent: *",
    "Allow: /",
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${absoluteUrl("sitemap.xml")}`,
    "",
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=86400");
  res.write(body);
  res.end();
  return { props: {} };
};

export default function Robots() {
  return null;
}
