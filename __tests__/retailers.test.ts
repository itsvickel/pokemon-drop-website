import { bestSellersFor, retailerSlug, summariseRetailers } from "../lib/retailers";
import type { Product } from "../lib/products";

const product = (
  key: string, retailer: string, price: number,
  opts: { others?: Array<[string, number, boolean?]>; inStock?: boolean;
          category?: string; updated?: string } = {},
): Product => ({
  group_key: key, name: key, price, retailer, url: "", is_preorder: false,
  updated: opts.updated ?? "2026-09-01T00:00:00Z", all_time_low: price,
  price_change_7d: null, history: [], history_days: 0, price_change_1d: null,
  price_change_30d: null, pack_count: null, price_per_pack: null, image_url: "",
  other_retailers: (opts.others ?? []).map(([r, p, s]) => ({
    retailer: r, price: p, url: "", in_stock: s ?? true, stock_qty: null,
  })),
  is_new: false, in_stock: opts.inStock ?? true, back_in_stock: false,
  language: "English", product_type: "Booster Box", set_name: "S", variant: "",
  category: opts.category ?? "sealed", msrp: null, deal_score: 50,
  last_restock_date: null,
} as unknown as Product);

const feed = (products: Product[], game = "mtg") => [{ game, products }];

describe("retailerSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(retailerSlug("Face to Face Games")).toBe("face-to-face-games");
  });

  it("spells out an ampersand rather than dropping it", () => {
    // "A&C Games" and "AC Games" would otherwise collide.
    expect(retailerSlug("A&C Games")).toBe("a-and-c-games");
  });

  it("strips punctuation without leaving stray hyphens", () => {
    expect(retailerSlug("Wizard's Tower (Ottawa)")).toBe("wizard-s-tower-ottawa");
  });

  it("handles a name that is already a slug", () => {
    expect(retailerSlug("401games")).toBe("401games");
  });

  it("never returns leading or trailing hyphens", () => {
    expect(retailerSlug("  !Store!  ")).toBe("store");
  });
});

describe("summariseRetailers", () => {
  it("counts listings from other_retailers, not just best-price wins", () => {
    // Otherwise a shop only appears for products where it is winning.
    const rows = summariseRetailers(feed([product("a", "Cheap Co", 10, { others: [["Dear Co", 20]] })]));
    expect(rows.find((r) => r.name === "Dear Co")?.listings).toBe(1);
  });

  it("credits the best price only to the retailer holding it", () => {
    const rows = summariseRetailers(feed([product("a", "Cheap Co", 10, { others: [["Dear Co", 20]] })]));
    expect(rows.find((r) => r.name === "Cheap Co")?.bestPriceWins).toBe(1);
    expect(rows.find((r) => r.name === "Dear Co")?.bestPriceWins).toBe(0);
  });

  it("reports the price range across a retailer's listings", () => {
    const rows = summariseRetailers(feed([
      product("a", "Shop", 10), product("b", "Shop", 50), product("c", "Shop", 30),
    ]));
    expect(rows[0].cheapest).toBe(10);
    expect(rows[0].dearest).toBe(50);
    expect(rows[0].medianPrice).toBe(30);
  });

  it("takes the midpoint for an even number of listings", () => {
    const rows = summariseRetailers(feed([product("a", "Shop", 10), product("b", "Shop", 20)]));
    expect(rows[0].medianPrice).toBe(15);
  });

  it("separates sealed from singles", () => {
    const rows = summariseRetailers(feed([
      product("a", "Shop", 10), product("b", "Shop", 20, { category: "single" }),
    ]));
    expect(rows[0].sealed).toBe(1);
    expect(rows[0].singles).toBe(1);
  });

  it("counts only listings that are in stock as in stock", () => {
    const rows = summariseRetailers(feed([
      product("a", "Shop", 10), product("b", "Shop", 20, { inStock: false }),
    ]));
    expect(rows[0].listings).toBe(2);
    expect(rows[0].inStock).toBe(1);
  });

  it("records every game a retailer appears in", () => {
    const rows = summariseRetailers([
      { game: "mtg", products: [product("a", "Shop", 10)] },
      { game: "pokemon", products: [product("b", "Shop", 10)] },
    ]);
    expect(rows[0].games).toEqual(["mtg", "pokemon"]);
  });

  it("attaches a known shipping policy", () => {
    const rows = summariseRetailers(feed([product("a", "Best Buy CA", 10)]));
    expect(rows[0].policy?.freeOver).toBe(35);
  });

  it("leaves the policy null rather than inventing one", () => {
    const rows = summariseRetailers(feed([product("a", "Nowhere Cards", 10)]));
    expect(rows[0].policy).toBeNull();
  });

  it("keeps the most recent update time", () => {
    const rows = summariseRetailers(feed([
      product("a", "Shop", 10, { updated: "2026-09-01T00:00:00Z" }),
      product("b", "Shop", 20, { updated: "2026-09-05T00:00:00Z" }),
    ]));
    expect(rows[0].lastUpdated).toBe("2026-09-05T00:00:00Z");
  });

  it("orders by catalogue size", () => {
    const rows = summariseRetailers(feed([
      product("a", "Small", 10), product("b", "Big", 10), product("c", "Big", 20),
    ]));
    expect(rows.map((r) => r.name)).toEqual(["Big", "Small"]);
  });

  it("returns nothing for an empty feed", () => {
    expect(summariseRetailers(feed([]))).toEqual([]);
  });
});

describe("bestSellersFor", () => {
  it("returns only listings the retailer holds the best price on", () => {
    const products = [product("a", "Shop", 10), product("b", "Other", 20)];
    expect(bestSellersFor(products, "Shop").map((p) => p.group_key)).toEqual(["a"]);
  });

  it("excludes sold-out listings, which are not a reason to visit", () => {
    const products = [product("a", "Shop", 10, { inStock: false }), product("b", "Shop", 20)];
    expect(bestSellersFor(products, "Shop").map((p) => p.group_key)).toEqual(["b"]);
  });

  it("sorts cheapest first and respects the limit", () => {
    const products = [product("a", "Shop", 30), product("b", "Shop", 10), product("c", "Shop", 20)];
    expect(bestSellersFor(products, "Shop", 2).map((p) => p.group_key)).toEqual(["b", "c"]);
  });
});
