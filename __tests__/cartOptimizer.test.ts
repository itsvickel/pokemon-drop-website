import { optimizeCart, offersFor, MAX_STORES, type WantedItem } from "../lib/cartOptimizer";
import type { Product } from "../lib/products";

function product(
  key: string,
  retailer: string,
  price: number,
  others: Array<[string, number] | [string, number, boolean]> = [],
  inStock = true,
): Product {
  return {
    group_key: key, name: key, price, retailer, url: `https://x/${key}`,
    is_preorder: false, updated: "", all_time_low: price, price_change_7d: null,
    history: [], history_days: 0, price_change_1d: null, price_change_30d: null,
    pack_count: null, price_per_pack: null, image_url: "",
    other_retailers: others.map(([r, p, st]) => ({ retailer: r, price: p, url: `https://x/${key}/${r}`, in_stock: st ?? true, stock_qty: null })),
    is_new: false, in_stock: inStock, back_in_stock: false, language: "English",
    product_type: "Booster Box", set_name: "S", variant: "", category: "sealed",
    msrp: null, deal_score: 50, last_restock_date: null,
  };
}

const want = (key: string, quantity = 1): WantedItem => ({ group_key: key, name: key, quantity });

describe("offersFor", () => {
  it("collects the primary and other retailers, cheapest first", () => {
    const offers = offersFor(product("a", "401 Games", 100, [["A&C Games", 80]]));
    expect(offers.map((o) => o.retailer)).toEqual(["A&C Games", "401 Games"]);
  });

  it("excludes foreign-currency retailers from a CAD comparison", () => {
    const offers = offersFor(product("a", "401 Games", 100, [["Flipside Gaming (US)", 10]]));
    expect(offers.map((o) => o.retailer)).not.toContain("Flipside Gaming (US)");
  });

  it("returns nothing for an unknown product", () => {
    expect(offersFor(undefined)).toEqual([]);
  });
});

describe("optimizeCart", () => {
  it("consolidates to one store when that clears free shipping", () => {
    // A&C Games ships free over $100. Splitting would be cheaper on stickers but
    // dearer once two lots of postage are counted.
    const products = [
      product("a", "A&C Games", 60, [["Heroes World", 55]]),
      product("b", "A&C Games", 60, [["Heroes World", 55]]),
    ];
    const { best } = optimizeCart([want("a"), want("b")], products);
    expect(best!.stores).toHaveLength(1);
    expect(best!.stores[0].retailer).toBe("A&C Games");
    expect(best!.stores[0].shipsFree).toBe(true);
    expect(best!.total).toBeCloseTo(120);
  });

  it("reports what consolidating saves when both plans are fully priced", () => {
    const products = [
      product("a", "A&C Games", 60, [["Heroes World", 55]]),
      product("b", "A&C Games", 60, [["Heroes World", 55]]),
    ];
    const { saving } = optimizeCart([want("a"), want("b")], products);
    expect(saving).not.toBeNull();
    expect(saving!).toBeGreaterThan(0);
  });

  it("refuses to quote a saving when shipping is unpriced", () => {
    // Fusion Gaming publishes no policy, so the two totals are not comparable
    // and any figure would be invented.
    const products = [
      product("a", "Fusion Gaming", 60),
      product("b", "Fusion Gaming", 60),
    ];
    expect(optimizeCart([want("a"), want("b")], products).saving).toBeNull();
  });

  it("still splits when one store genuinely cannot supply everything", () => {
    const products = [
      product("a", "A&C Games", 60),
      product("b", "Deck Out Gaming", 60),
    ];
    const { best } = optimizeCart([want("a"), want("b")], products);
    expect(best!.stores).toHaveLength(2);
    expect(best!.complete).toBe(true);
  });

  it("multiplies by quantity", () => {
    const products = [product("a", "A&C Games", 25)];
    const { best } = optimizeCart([want("a", 4)], products);
    expect(best!.itemsTotal).toBeCloseTo(100);
    expect(best!.lines[0].lineTotal).toBeCloseTo(100);
  });

  it("prefers a complete plan over a cheaper incomplete one", () => {
    // A plan that skips half the basket is not cheaper, it is a different basket.
    const products = [
      product("a", "A&C Games", 200),
      product("b", "Deck Out Gaming", 5),
    ];
    const { best } = optimizeCart([want("a"), want("b")], products);
    expect(best!.complete).toBe(true);
    expect(best!.missing).toHaveLength(0);
  });

  it("flags retailers whose shipping cannot be priced", () => {
    // Fusion Gaming publishes no threshold; treating that as free would make the
    // optimiser favour exactly the stores we know least about.
    const products = [product("a", "Fusion Gaming", 40)];
    const { best } = optimizeCart([want("a")], products);
    expect(best!.unpricedShipping).toContain("Fusion Gaming");
    expect(best!.stores[0].shippingKnown).toBe(false);
  });

  it("tells you how close a store is to free shipping", () => {
    const products = [product("a", "401 Games", 100)];  // free over 149
    const { best } = optimizeCart([want("a")], products);
    expect(best!.stores[0].addToFree).toBeCloseTo(49);
  });

  it("applies provincial tax to the total", () => {
    const products = [product("a", "A&C Games", 100)];
    const plain = optimizeCart([want("a")], products).best!;
    const ontario = optimizeCart([want("a")], products, { province: "ON" }).best!;
    expect(ontario.total).toBeCloseTo(plain.total * 1.13);
    expect(ontario.tax).toBeGreaterThan(0);
  });

  it("reports items nothing can supply", () => {
    const { best } = optimizeCart([want("ghost")], [product("a", "A&C Games", 10)]);
    expect(best).toBeNull();
  });

  it("marks an unsuppliable item as missing when others can be bought", () => {
    const products = [product("a", "A&C Games", 60)];
    const { best } = optimizeCart([want("a"), want("ghost")], products);
    expect(best!.complete).toBe(false);
    expect(best!.missing.map((m) => m.group_key)).toEqual(["ghost"]);
  });

  it("never proposes more stores than the cap", () => {
    const products = ["a", "b", "c", "d", "e"].map((k, i) =>
      product(k, `Store ${i}`, 20)
    );
    const { best } = optimizeCart(products.map((p) => want(p.group_key)), products);
    expect(best!.stores.length).toBeLessThanOrEqual(MAX_STORES);
  });

  it("prefers fewer orders when the money is identical", () => {
    const products = [
      product("a", "A&C Games", 60, [["Deck Out Gaming", 60]]),
      product("b", "A&C Games", 60, [["Deck Out Gaming", 60]]),
    ];
    const { best } = optimizeCart([want("a"), want("b")], products);
    expect(best!.stores).toHaveLength(1);
  });

  it("handles an empty basket without throwing", () => {
    const result = optimizeCart([], [product("a", "A&C Games", 10)]);
    expect(result.best).toBeNull();
    expect(result.consideredRetailers).toBe(0);
  });
});

describe("sold-out offers", () => {
  it("ignores a sold-out listing even when it is the cheapest", () => {
    // The crawler holds a listing's last known price after it sells out, and
    // that price is often the lowest the product ever showed.
    const offers = offersFor(product("a", "401 Games", 100, [["A&C Games", 10, false]]));
    expect(offers.map((o) => o.retailer)).toEqual(["401 Games"]);
  });

  it("yields no offers when every listing is sold out", () => {
    const offers = offersFor(product("a", "401 Games", 100, [["A&C Games", 80, false]], false));
    expect(offers).toEqual([]);
  });

  it("reports a sold-out-everywhere item as missing rather than planning it", () => {
    const result = optimizeCart(
      [want("dead"), want("alive")],
      [product("dead", "401 Games", 10, [], false), product("alive", "401 Games", 50)],
      {},
    );
    expect(result.best).not.toBeNull();
    expect(result.best!.complete).toBe(false);
    expect(result.best!.missing.map((m) => m.group_key)).toEqual(["dead"]);
    expect(result.best!.lines.map((l) => l.item.group_key)).toEqual(["alive"]);
  });

  it("routes an item to a pricier retailer that actually has it", () => {
    const result = optimizeCart(
      [want("a")],
      [product("a", "401 Games", 10, [["A&C Games", 40]], false)],
      {},
    );
    expect(result.best!.lines[0].retailer).toBe("A&C Games");
    expect(result.best!.lines[0].unitPrice).toBe(40);
  });
});
