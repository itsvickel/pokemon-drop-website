import { priceMatchCases, MIN_MATCH_SAVING, MAX_CREDIBLE_GAP_PCT } from "../lib/priceMatch";
import type { Product } from "../lib/products";

function product(
  primary: { retailer: string; price: number; inStock?: boolean },
  others: Array<{ retailer: string; price: number; inStock?: boolean }> = []
): Product {
  return {
    group_key: "k", name: "Bloomburrow Booster Box", price: primary.price,
    retailer: primary.retailer, url: "https://x/primary",
    is_preorder: false, updated: "", all_time_low: 0, price_change_7d: null,
    history: [], history_days: 0, price_change_1d: null, price_change_30d: null,
    pack_count: null, price_per_pack: null, image_url: "",
    other_retailers: others.map((o) => ({
      retailer: o.retailer, price: o.price, url: `https://x/${o.retailer}`,
      in_stock: o.inStock !== false, stock_qty: null,
    })),
    is_new: false, in_stock: primary.inStock !== false, back_in_stock: false,
    language: "English", product_type: "Booster Box", set_name: "Bloomburrow",
    variant: "", category: "sealed", msrp: null, deal_score: 50, last_restock_date: null,
  };
}

const AT = new Date("2026-09-07T12:00:00Z");

describe("priceMatchCases", () => {
  it("builds a case against each dearer retailer", () => {
    const cases = priceMatchCases(
      product({ retailer: "Expensive Co", price: 150 }, [{ retailer: "Cheap Co", price: 120 }]),
      AT
    );
    expect(cases).toHaveLength(1);
    expect(cases[0].askRetailer).toBe("Expensive Co");
    expect(cases[0].citeRetailer).toBe("Cheap Co");
    expect(cases[0].saving).toBeCloseTo(30);
  });

  it("orders dearest first, since they have the most to gain by matching", () => {
    const cases = priceMatchCases(
      product({ retailer: "Mid Co", price: 140 }, [
        { retailer: "Cheap Co", price: 120 },
        { retailer: "Dear Co", price: 160 },
      ]),
      AT
    );
    expect(cases.map((c) => c.askRetailer)).toEqual(["Dear Co", "Mid Co"]);
  });

  it("never cites an out-of-stock competitor", () => {
    // Almost no policy honours an out-of-stock price; suggesting it wastes the
    // buyer's time and annoys the store.
    const cases = priceMatchCases(
      product({ retailer: "Dear Co", price: 150 }, [
        { retailer: "Gone Co", price: 90, inStock: false },
        { retailer: "Cheap Co", price: 120 },
      ]),
      AT
    );
    expect(cases[0].citeRetailer).toBe("Cheap Co");
    expect(cases[0].citePrice).toBe(120);
  });

  it("returns nothing when no retailer has stock", () => {
    const cases = priceMatchCases(
      product({ retailer: "Dear Co", price: 150, inStock: false }, [
        { retailer: "Cheap Co", price: 120, inStock: false },
      ]),
      AT
    );
    expect(cases).toEqual([]);
  });

  it("ignores savings too small to be worth asking about", () => {
    const cases = priceMatchCases(
      product({ retailer: "Dear Co", price: 100 }, [
        { retailer: "Cheap Co", price: 100 - (MIN_MATCH_SAVING - 1) },
      ]),
      AT
    );
    expect(cases).toEqual([]);
  });

  it("ignores implausibly large gaps, which usually mean mismatched products", () => {
    const cases = priceMatchCases(
      product({ retailer: "Dear Co", price: 500 }, [{ retailer: "Cheap Co", price: 20 }]),
      AT
    );
    expect(cases).toEqual([]);
    expect(MAX_CREDIBLE_GAP_PCT).toBeLessThan(100);
  });

  it("excludes foreign-currency retailers from the comparison", () => {
    const cases = priceMatchCases(
      product({ retailer: "Dear Co", price: 150 }, [{ retailer: "Flipside Gaming (US)", price: 80 }]),
      AT
    );
    expect(cases).toEqual([]);
  });

  it("writes a message carrying store, price, link and date", () => {
    const [c] = priceMatchCases(
      product({ retailer: "Dear Co", price: 150 }, [{ retailer: "Cheap Co", price: 120 }]),
      AT
    );
    expect(c.message).toContain("Bloomburrow Booster Box");
    expect(c.message).toContain("$150.00");
    expect(c.message).toContain("Cheap Co");
    expect(c.message).toContain("$120.00");
    expect(c.message).toContain("https://x/Cheap Co".replace(" ", "%20").slice(0, 12));
    expect(c.message).toContain("2026-09-07");
  });

  it("never asserts that a retailer has a price-match policy", () => {
    // We do not track which retailers match, so the wording must stay
    // conditional rather than claiming a policy exists.
    const [c] = priceMatchCases(
      product({ retailer: "Dear Co", price: 150 }, [{ retailer: "Cheap Co", price: 120 }]),
      AT
    );
    expect(c.message).toMatch(/if you price match/i);
  });

  it("returns nothing for a single-retailer product", () => {
    expect(priceMatchCases(product({ retailer: "Only Co", price: 100 }), AT)).toEqual([]);
  });
});
