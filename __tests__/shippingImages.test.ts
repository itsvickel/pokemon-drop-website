import {
  SHIPPING_POLICIES,
  SHIPPING_THRESHOLDS,
  deliveredPrice,
  deliveredSortKey,
  shippingLabel,
} from "../lib/shipping";
import { DETAIL, THUMB, sizedImage, thumbSrcSet } from "../lib/images";
import { historySpanDays, hasReliableLow, slimProduct, scopeForView, catalogueCounts, LIST_HISTORY_POINTS, type Product } from "../lib/products";
import { LOW_BADGE_MIN_DAYS, RETAILER_CLAIM, UPDATE_CADENCE } from "../lib/siteFacts";

describe("shipping policies", () => {
  it("never invents a threshold for a retailer that publishes none", () => {
    // Fusion Gaming and House of Cards are the two largest sources of listings
    // on the site and neither states a figure. Guessing would make the
    // delivered-price comparison actively wrong.
    expect(SHIPPING_POLICIES["Fusion Gaming"].freeOver).toBeNull();
    expect(SHIPPING_POLICIES["House of Cards"].freeOver).toBeNull();
    expect(SHIPPING_POLICIES["Multizone"].freeOver).toBeNull();
  });

  it("carries a source URL for every threshold added from research", () => {
    for (const name of ["Derpy Cards", "GT Games", "Doe's Cards", "Flipside Gaming (US)", "Heroes World"]) {
      expect(SHIPPING_POLICIES[name].source).toMatch(/^https?:\/\//);
    }
  });

  it("flags non-CAD retailers so they are excluded from delivered maths", () => {
    expect(SHIPPING_POLICIES["Flipside Gaming (US)"].foreign).toBe(true);
    expect(SHIPPING_POLICIES["Obsidia TCG"].currency).toBe("GBP");
  });

  it("keeps the legacy label map derived, so labels cannot drift", () => {
    expect(SHIPPING_THRESHOLDS["401 Games"]).toBe("Free $149+");
    expect(SHIPPING_THRESHOLDS["Derpy Cards"]).toBe("Free $175+");
    expect(SHIPPING_THRESHOLDS["Fusion Gaming"]).toBe("Check site for shipping");
  });

  it("labels a flat-rate retailer without claiming a free tier", () => {
    expect(shippingLabel("Heroes World")).toBe("Flat ~$15");
  });

  it("labels an unknown retailer safely", () => {
    expect(shippingLabel("Some Shop That Does Not Exist")).toBe("Check site for shipping");
  });
});

describe("deliveredPrice", () => {
  it("reports free shipping once the threshold is cleared", () => {
    const d = deliveredPrice(160, "401 Games"); // free over 149
    expect(d.shipsFree).toBe(true);
    expect(d.total).toBe(160);
    expect(d.label).toBe("Ships free");
  });

  it("says how much more is needed rather than inventing a rate", () => {
    const d = deliveredPrice(100, "401 Games");
    expect(d.shipsFree).toBe(false);
    expect(d.total).toBeNull();
    expect(d.reason).toBe("rate-unknown");
    expect(d.addToFree).toBe(49);
  });

  it("adds a known flat rate to the total", () => {
    const d = deliveredPrice(50, "Heroes World"); // flat 15, no free tier
    expect(d.total).toBe(65);
    expect(d.shipsFree).toBe(false);
  });

  it("declines to price a foreign-currency retailer", () => {
    const d = deliveredPrice(80, "Flipside Gaming (US)");
    expect(d.total).toBeNull();
    expect(d.reason).toBe("foreign-currency");
    expect(d.label).toContain("USD");
  });

  it("declines to price a retailer with no published policy", () => {
    const d = deliveredPrice(80, "Fusion Gaming");
    expect(d.total).toBeNull();
    expect(d.reason).toBe("unknown-policy");
    expect(d.label).toBe("+ shipping");
  });

  it("treats the threshold as inclusive", () => {
    expect(deliveredPrice(149, "401 Games").shipsFree).toBe(true);
  });
});

describe("deliveredSortKey", () => {
  it("ranks a dearer free-shipping item above a cheaper one that needs postage", () => {
    // The whole point of the feature: $105 shipping free beats $95 + postage.
    const cheapButShips = deliveredSortKey(95, "Heroes World"); // 95 + 15 = 110
    const dearerFree = deliveredSortKey(105, "A&C Games");      // free over 100
    expect(dearerFree).toBeLessThan(cheapButShips);
  });

  it("falls back to the listed price when the policy is unknown", () => {
    expect(deliveredSortKey(80, "Fusion Gaming")).toBe(80);
  });
});

describe("sizedImage", () => {
  const shopify = "https://cdn.shopify.com/s/files/1/0567/4178/9882/files/531490.jpg";

  it("inserts the size suffix before the extension", () => {
    expect(sizedImage(shopify, THUMB)).toBe(
      "https://cdn.shopify.com/s/files/1/0567/4178/9882/files/531490_200x.jpg"
    );
  });

  it("supports a larger detail width", () => {
    expect(sizedImage(shopify, DETAIL)).toContain("_800x.jpg");
  });

  it("leaves non-Shopify hosts untouched", () => {
    const other = "https://static-ca.gamestop.ca/img/thing.png";
    expect(sizedImage(other)).toBe(other);
  });

  it("does not double up on an already-sized URL", () => {
    const already = "https://cdn.shopify.com/s/files/1/1/x_400x.jpg";
    expect(sizedImage(already, THUMB)).toBe(already);
  });

  it("leaves an extensionless URL alone", () => {
    const weird = "https://cdn.shopify.com/s/files/1/1/image";
    expect(sizedImage(weird)).toBe(weird);
  });

  it("returns empty string for missing input rather than throwing", () => {
    expect(sizedImage(undefined)).toBe("");
    expect(sizedImage(null)).toBe("");
  });

  it("returns a malformed URL unchanged rather than throwing", () => {
    expect(sizedImage("not a url")).toBe("not a url");
  });

  it("builds a 1x/2x srcset for retina", () => {
    const set = thumbSrcSet(shopify);
    expect(set).toContain("_200x.jpg 1x");
    expect(set).toContain("_400x.jpg 2x");
  });

  it("omits srcset when the host cannot resize", () => {
    expect(thumbSrcSet("https://example.com/a.png")).toBeUndefined();
  });
});

describe("history span and the low badge", () => {
  const day = (n: number) => `2026-0${Math.floor(n / 28) + 1}-${String((n % 28) + 1).padStart(2, "0")}`;
  const series = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: day(i), price: 10 + i, retailer: "X" }));

  it("measures the span between first and last observation", () => {
    expect(historySpanDays(series(31))).toBeGreaterThanOrEqual(29);
  });

  it("treats a single point as no span", () => {
    expect(historySpanDays(series(1))).toBe(0);
    expect(historySpanDays([])).toBe(0);
    expect(historySpanDays(undefined)).toBe(0);
  });

  it("withholds the low badge under the minimum tracked history", () => {
    // A six-day low wearing a 90-day label is the exact thing being prevented.
    expect(hasReliableLow(series(6))).toBe(false);
  });

  it("allows the badge once there is enough history", () => {
    expect(hasReliableLow(series(LOW_BADGE_MIN_DAYS + 3))).toBe(true);
  });

  it("ignores unparseable dates rather than throwing", () => {
    expect(historySpanDays([{ date: "nope", price: 1, retailer: "X" }, { date: "also nope", price: 2, retailer: "X" }])).toBe(0);
  });
});

describe("site claims", () => {
  it("states a retailer floor the data supports", () => {
    // Measured 21 unique across both games; the copy must never overstate.
    expect(Number(RETAILER_CLAIM.replace("+", ""))).toBeLessThanOrEqual(21);
  });

  it("no longer claims a three-hour cadence the trackers do not meet", () => {
    expect(UPDATE_CADENCE).not.toMatch(/3 hours|three hours/i);
  });
});

describe("list payload trimming", () => {
  const entry = (i: number) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, price: 10 + i, retailer: "X" });
  const product = (n: number) =>
    ({ group_key: "k", history: Array.from({ length: n }, (_, i) => entry(i)), history_days: 90 } as unknown as Product);

  it("keeps short histories untouched", () => {
    const p = product(5);
    expect(slimProduct(p).history).toHaveLength(5);
    expect(slimProduct(p)).toBe(p);
  });

  it("keeps only the most recent points for long histories", () => {
    const trimmed = slimProduct(product(72));
    expect(trimmed.history).toHaveLength(LIST_HISTORY_POINTS);
    // The tail is what a sparkline shows, so the newest points must survive.
    expect(trimmed.history[trimmed.history.length - 1].price).toBe(10 + 71);
  });

  it("does not mutate the original product", () => {
    const p = product(72);
    slimProduct(p);
    expect(p.history).toHaveLength(72);
  });

  it("preserves history_days so the low badge still knows the real span", () => {
    // Without this, trimming would make every product look newly tracked and
    // silently suppress the badge everywhere.
    const trimmed = slimProduct(product(72));
    expect(trimmed.history_days).toBe(90);
    expect(hasReliableLow(trimmed)).toBe(true);
  });

  it("trusts history_days over the trimmed slice", () => {
    const shortSlice = { history: [entry(0), entry(1)], history_days: 60 };
    expect(hasReliableLow(shortSlice)).toBe(true);
  });

  it("falls back to measuring history when history_days is absent", () => {
    expect(hasReliableLow({ history: [entry(0), entry(1)] })).toBe(false);
  });
});

describe("view scoping", () => {
  const p = (key: string, category: "sealed" | "single", withCard = false) =>
    ({
      group_key: key, category, history: [], history_days: 0,
      ...(withCard ? { card: { card_name: key, image_url: "x" } } : {}),
    } as unknown as Product);

  it("returns only the requested category", () => {
    const rows = [p("a", "sealed"), p("b", "single"), p("c", "sealed")];
    expect(scopeForView(rows, "sealed").map((x) => x.group_key)).toEqual(["a", "c"]);
    expect(scopeForView(rows, "singles").map((x) => x.group_key)).toEqual(["b"]);
  });

  it("drops card enrichment from the sealed view, which never reads it", () => {
    // card was 14% of the payload and only ever renders on the singles page.
    const [only] = scopeForView([p("a", "sealed", true)], "sealed");
    expect("card" in only).toBe(false);
  });

  it("keeps card enrichment for singles, which needs the image", () => {
    const [only] = scopeForView([p("b", "single", true)], "singles");
    expect(only.card).toBeDefined();
  });

  it("passes everything through for the unscoped view", () => {
    const rows = [p("a", "sealed", true), p("b", "single")];
    expect(scopeForView(rows, "all")).toHaveLength(2);
    expect(scopeForView(rows, "all")[0].card).toBeDefined();
  });

  it("counts the whole catalogue regardless of scoping", () => {
    // The sub-nav shows both tab counts, so a scoped payload still has to say
    // how many are on the other tab.
    const counts = catalogueCounts([p("a", "sealed"), p("b", "single"), p("c", "single")]);
    expect(counts).toEqual({ sealed: 1, singles: 2 });
  });

  it("keeps the sparkline window small enough to matter", () => {
    // A 40px sparkline cannot resolve more than about ten points, and history
    // was 44% of the payload.
    expect(LIST_HISTORY_POINTS).toBeLessThanOrEqual(12);
  });
});
