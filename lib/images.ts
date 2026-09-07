/**
 * images.ts — right-size retailer images at the CDN.
 *
 * 96% of product images (2,535 of 2,591) are hosted on cdn.shopify.com, which
 * resizes for free via a `_WxH` suffix before the file extension. Measured as a
 * browser actually fetches them — Shopify content-negotiates WebP, so the real
 * baseline is ~188 KB per image, not the 1.3 MB PNG a naive curl sees:
 *
 *     current   188 KB avg    ~8.8 MB for a 48-card grid
 *     _400x      72 KB avg    ~3.4 MB   (-61%)
 *     _200x      20 KB avg    ~0.9 MB   (-89%)
 *
 * This is why the site does not use next/image here: the CDN already does the
 * work, it costs nothing, and it consumes none of the Hobby plan's image
 * optimisation quota.
 *
 * Note the `.webp` extension swap 404s on this CDN — only the size suffix
 * works, and format is handled by negotiation.
 */

/** Widths that match how images are actually displayed. */
export const THUMB = 200;   // grid cards, compare rows, calendar/drop thumbs
export const DETAIL = 800;  // product hero and lightbox

const SHOPIFY_HOST = "cdn.shopify.com";
const SIZEABLE = /^(.*)(\.(?:png|jpe?g|webp|gif))$/i;
/** Already carries a _WxH (or _WxH_crop_center) suffix. */
const ALREADY_SIZED = /_\d+x\d*(?:_[a-z_]+)?(\.[a-z]+)$/i;

/**
 * Request an appropriately sized variant when the host supports it, otherwise
 * return the URL untouched. Never throws on a malformed URL — a broken image is
 * a worse failure than a large one.
 */
export function sizedImage(url: string | undefined | null, width: number = THUMB): string {
  if (!url) return "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== SHOPIFY_HOST) return url;

  const path = parsed.pathname;
  if (ALREADY_SIZED.test(path)) return url;

  const match = path.match(SIZEABLE);
  if (!match) return url;

  parsed.pathname = `${match[1]}_${width}x${match[2]}`;
  return parsed.toString();
}

/** `srcset` for a thumbnail, so retina screens stay sharp at 2x the cost. */
export function thumbSrcSet(url: string | undefined | null, width: number = THUMB): string | undefined {
  if (!url) return undefined;
  const one = sizedImage(url, width);
  const two = sizedImage(url, width * 2);
  if (one === two) return undefined;
  return `${one} 1x, ${two} 2x`;
}
