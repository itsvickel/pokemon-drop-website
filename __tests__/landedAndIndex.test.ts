import { PROVINCES, provinceRate, provinceName, withTax, taxLabel } from "../lib/tax";
import { deliveredSortKey, landedPrice } from "../lib/shipping";
import { marketIndex, describeIndex, INDEX_MIN_SAMPLE, INDEX_MIN_PRICE } from "../lib/marketIndex";
import { pricePercentile, discountCheck, STALE_SALE_DAYS } from "../lib/insights";
import type { Product, HistoryEntry } from "../lib/products";

const NOW = new Date("2026-09-07T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const h = (n: number, price: number): HistoryEntry => ({ date: daysAgo(n), price, retailer: "X" });

function product(over: Partial<Product> = {}): Product {
  return {
    group_key: "k", name: "Thing", price: 100, retailer: "401 Games", url: "",
    is_preorder: false, updated: "", all_time_low: 90, price_change_7d: null,
    history: [h(60, 100), h(1, 100)], history_days: 60, price_change_1d: null,
    price_change_30d: null, pack_count: null, price_per_pack: null, image_url: "",
    other_retailers: [], is_new: false, in_stock: true, back_in_stock: false,
    language: "English", product_type: "Booster Box", set_name: "S", variant: "",
    category: "sealed", msrp: null, deal_score: 50, last_restock_date: null,
    ...over,
  };
}

describe("provincial tax", () => {
  it("covers every province and territory", () => {
    expect(PROVINCES).toHaveLength(13);
  });

  it("spans the real 5%-to-15% range", () => {
    const rates = PROVINCES.map((p) => p.rate);
    expect(Math.min(...rates)).toBeCloseTo(0.05);
    expect(Math.max(...rates)).toBeCloseTo(0.15);
  });

  it("applies the right rate", () => {
    expect(withTax(100, "AB")).toBeCloseTo(105);
    expect(withTax(100, "ON")).toBeCloseTo(113);
    expect(withTax(100, "NS")).toBeCloseTo(114);
  });

  it("leaves the price alone when no province is chosen", () => {
    // Showing an invented tax figure would be worse than showing none.
    expect(withTax(100, null)).toBe(100);
    expect(withTax(100, "ZZ")).toBe(100);
  });

  it("is case-insensitive about the code", () => {
    expect(provinceRate("on")).toBeCloseTo(0.13);
    expect(provinceName("bc")).toBe("British Columbia");
  });

  it("labels the rate, with Quebec's fractional percent intact", () => {
    expect(taxLabel("ON")).toBe("incl. 13% tax");
    expect(taxLabel("QC")).toBe("incl. 14.975% tax");
    expect(taxLabel(null)).toBeNull();
  });
});

describe("landed cost", () => {
  it("adds tax on top of a delivered total", () => {
    // 160 clears 401 Games' $149 free-shipping threshold, then Ontario tax.
    const landed = landedPrice(160, "401 Games", "ON");
    expect(landed.taxed).toBe(true);
    expect(landed.total).toBeCloseTo(160 * 1.13);
  });

  it("cannot tax a total it could not compute", () => {
    const landed = landedPrice(80, "Fusion Gaming", "ON");
    expect(landed.total).toBeNull();
    expect(landed.taxed).toBe(false);
  });

  it("changes which retailer is cheapest depending on province", () => {
    // The point of the feature: a 10-point tax spread outweighs small price gaps.
    const ab = deliveredSortKey(160, "401 Games", "AB");
    const ns = deliveredSortKey(160, "401 Games", "NS");
    expect(ns).toBeGreaterThan(ab);
  });

  it("leaves ordering unchanged with no province selected", () => {
    expect(deliveredSortKey(160, "401 Games")).toBeCloseTo(160);
  });
});

describe("price percentile", () => {
  const series = Array.from({ length: 20 }, (_, i) => h(60 - i * 3, 100 + i));

  it("reports where today's price sits in the range", () => {
    // Below every observation, so cheaper than ~all of them.
    expect(pricePercentile(50, series)).toBeGreaterThanOrEqual(95);
  });

  it("reports a high price as cheap-than-few", () => {
    expect(pricePercentile(500, series)).toBe(0);
  });

  it("declines on too little history rather than guessing", () => {
    // A percentile over four points is arithmetic pretending to be evidence.
    expect(pricePercentile(100, [h(30, 100), h(1, 90)])).toBeNull();
  });
});

describe("fake-discount detection", () => {
  it("flags a price that has not moved in weeks", () => {
    const flat = Array.from({ length: 12 }, (_, i) => h(40 - i * 3, 79.99));
    const check = discountCheck(79.99, flat, NOW);
    expect(check.suspicious).toBe(true);
    expect(check.daysAtPrice).toBeGreaterThanOrEqual(STALE_SALE_DAYS);
    expect(check.message).toMatch(/hasn't changed/);
  });

  it("stays quiet when the price genuinely just dropped", () => {
    const dropped = [h(30, 120), h(20, 120), h(10, 120), h(5, 120), h(2, 120), h(0, 89)];
    expect(discountCheck(89, dropped, NOW).suspicious).toBe(false);
  });

  it("stays quiet without enough history to judge", () => {
    expect(discountCheck(50, [h(2, 50)], NOW).suspicious).toBe(false);
    expect(discountCheck(50, undefined, NOW).suspicious).toBe(false);
  });

  it("never accuses, only states how long the price held", () => {
    const flat = Array.from({ length: 12 }, (_, i) => h(40 - i * 3, 50));
    expect(discountCheck(50, flat, NOW).message).not.toMatch(/fake|lie|scam|dishonest/i);
  });
});

describe("market index", () => {
  const many = (n: number, change: number) =>
    Array.from({ length: n }, (_, i) => product({ group_key: `p${i}`, price_change_7d: change }));

  it("refuses to report on too small a sample", () => {
    const idx = marketIndex(many(5, 3));
    expect(idx.change).toBeNull();
    expect(idx.sample).toBe(5);
    expect(describeIndex(idx, "MTG")).toMatch(/Not enough/);
  });

  it("reports a median once the sample is large enough", () => {
    const idx = marketIndex(many(INDEX_MIN_SAMPLE + 5, 4));
    expect(idx.change).toBeCloseTo(4);
    expect(idx.advancing).toBe(100);
  });

  it("uses a median so one bad row cannot move it", () => {
    // A mis-scraped 3000% swing would drag a mean anywhere.
    const rows = [...many(INDEX_MIN_SAMPLE + 4, 1), product({ group_key: "wild", price_change_7d: 3000 })];
    expect(marketIndex(rows).change).toBeCloseTo(1);
  });

  it("excludes singles and cheap products", () => {
    const rows = [
      ...many(INDEX_MIN_SAMPLE + 2, 2),
      ...Array.from({ length: 30 }, (_, i) => product({ group_key: `s${i}`, category: "single", price_change_7d: -50 })),
      ...Array.from({ length: 30 }, (_, i) => product({ group_key: `c${i}`, price: INDEX_MIN_PRICE - 1, price_change_7d: -50 })),
    ];
    expect(marketIndex(rows).change).toBeCloseTo(2);
  });

  it("states its sample size in the description", () => {
    const idx = marketIndex(many(INDEX_MIN_SAMPLE + 5, 4));
    expect(describeIndex(idx, "MTG")).toMatch(new RegExp(`${idx.sample} tracked products`));
  });
});
