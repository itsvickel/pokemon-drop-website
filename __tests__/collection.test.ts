import { valueCollection, portfolioTotals, coverageNote, type Holding } from "../lib/collection";
import type { Product } from "../lib/products";

function product(key: string, price: number): Product {
  return {
    group_key: key, name: key, price, retailer: "401 Games", url: "",
    is_preorder: false, updated: "", all_time_low: price, price_change_7d: null,
    history: [], history_days: 0, price_change_1d: null, price_change_30d: null,
    pack_count: null, price_per_pack: null, image_url: "", other_retailers: [],
    is_new: false, in_stock: true, back_in_stock: false, language: "English",
    product_type: "Booster Box", set_name: "S", variant: "", category: "sealed",
    msrp: null, deal_score: 50, last_restock_date: null,
  };
}

const holding = (over: Partial<Holding> = {}): Holding => ({
  group_key: "a", product_name: "A", tcg: "mtg",
  quantity: 1, unit_cost: null, purchased_at: null, ...over,
});

describe("valuing a collection", () => {
  const products = [product("a", 150), product("b", 40)];

  it("multiplies price by quantity", () => {
    const [v] = valueCollection([holding({ group_key: "a", quantity: 3 })], products);
    expect(v.marketValue).toBe(450);
  });

  it("computes gain when a cost basis exists", () => {
    const [v] = valueCollection([holding({ group_key: "a", quantity: 2, unit_cost: 100 })], products);
    expect(v.costTotal).toBe(200);
    expect(v.gain).toBe(100);
    expect(v.gainPct).toBeCloseTo(50);
  });

  it("reports a loss as negative", () => {
    const [v] = valueCollection([holding({ group_key: "b", unit_cost: 60 })], products);
    expect(v.gain).toBe(-20);
  });

  it("leaves gain null when no cost was recorded", () => {
    // Treating a missing cost as zero would show a fabricated 100% gain.
    const [v] = valueCollection([holding({ group_key: "a" })], products);
    expect(v.costTotal).toBeNull();
    expect(v.gain).toBeNull();
    expect(v.gainPct).toBeNull();
  });

  it("marks an untracked product as unvalued rather than worth zero", () => {
    // A product dropping out of the feed must not look like a crash to zero.
    const [v] = valueCollection([holding({ group_key: "gone", unit_cost: 50 })], products);
    expect(v.marketPrice).toBeNull();
    expect(v.marketValue).toBeNull();
    expect(v.gain).toBeNull();
  });
});

describe("portfolio totals", () => {
  const products = [product("a", 150), product("b", 40)];

  it("sums value and units", () => {
    const totals = portfolioTotals(valueCollection([
      holding({ group_key: "a", quantity: 2, unit_cost: 100 }),
      holding({ group_key: "b", quantity: 5, unit_cost: 30 }),
    ], products));
    expect(totals.units).toBe(7);
    expect(totals.marketValue).toBeCloseTo(2 * 150 + 5 * 40);
    expect(totals.costTotal).toBeCloseTo(2 * 100 + 5 * 30);
    expect(totals.gain).toBeCloseTo(150);
  });

  it("computes gain only across holdings that have both sides", () => {
    // Differencing two partly-populated totals would invent a gain from the
    // holding that has a price but no cost.
    const totals = portfolioTotals(valueCollection([
      holding({ group_key: "a", unit_cost: 100 }),   // +50
      holding({ group_key: "b" }),                    // priced, no cost
    ], products));
    expect(totals.gain).toBeCloseTo(50);
    expect(totals.gainPct).toBeCloseTo(50);
  });

  it("reports coverage so a partial valuation is visible", () => {
    const totals = portfolioTotals(valueCollection([
      holding({ group_key: "a", unit_cost: 100 }),
      holding({ group_key: "gone", unit_cost: 20 }),
      holding({ group_key: "b" }),
    ], products));
    expect(totals.holdings).toBe(3);
    expect(totals.valued).toBe(2);
    expect(totals.withCost).toBe(2);
  });

  it("has no percentage when nothing has a cost basis", () => {
    const totals = portfolioTotals(valueCollection([holding({ group_key: "a" })], products));
    expect(totals.gainPct).toBeNull();
  });

  it("handles an empty collection", () => {
    const totals = portfolioTotals([]);
    expect(totals).toMatchObject({ holdings: 0, units: 0, marketValue: 0, gain: 0, gainPct: null });
  });
});

describe("coverage note", () => {
  const products = [product("a", 150)];

  it("says nothing when everything is priced and costed", () => {
    const totals = portfolioTotals(valueCollection([holding({ group_key: "a", unit_cost: 10 })], products));
    expect(coverageNote(totals)).toBeNull();
  });

  it("explains untracked and cost-less holdings", () => {
    const totals = portfolioTotals(valueCollection([
      holding({ group_key: "gone", unit_cost: 5 }),
      holding({ group_key: "a" }),
    ], products));
    const note = coverageNote(totals)!;
    expect(note).toMatch(/no longer tracked/);
    expect(note).toMatch(/without a recorded cost/);
  });

  it("says nothing for an empty collection", () => {
    expect(coverageNote(portfolioTotals([]))).toBeNull();
  });
});
