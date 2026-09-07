/**
 * The optimiser against a real basket, taken from live feed output.
 *
 * Unit tests prove the rules; this proves the rules produce a plan a person
 * would actually follow. Regenerate the fixture when the feed shape changes.
 */
import { optimizeCart, MAX_STORES, type WantedItem } from "../lib/cartOptimizer";
import type { Product } from "../lib/products";
import fixture from "./fixtures/basket.mtg.json";

const products = (fixture as { products: Product[] }).products;
const basket: WantedItem[] = products.map((p) => ({
  group_key: p.group_key,
  name: p.name,
  quantity: 1,
}));

describe("optimising a real 8-item basket", () => {
  const result = optimizeCart(basket, products, { province: "ON" });

  it("finds a plan that covers the whole basket", () => {
    expect(result.best).not.toBeNull();
    expect(result.best!.complete).toBe(true);
    expect(result.best!.lines).toHaveLength(basket.length);
  });

  it("keeps the plan to a realistic number of orders", () => {
    expect(result.best!.stores.length).toBeLessThanOrEqual(MAX_STORES);
    expect(result.best!.stores.length).toBeGreaterThan(0);
  });

  it("sources every line from a store that is actually in the plan", () => {
    const chosen = new Set(result.best!.stores.map((s) => s.retailer));
    for (const line of result.best!.lines) {
      expect(chosen.has(line.retailer)).toBe(true);
    }
  });

  it("has store subtotals that add up to the items total", () => {
    const summed = result.best!.stores.reduce((n, s) => n + s.subtotal, 0);
    expect(summed).toBeCloseTo(result.best!.itemsTotal, 1);
  });

  it("charges Ontario tax on the total", () => {
    expect(result.best!.tax).toBeGreaterThan(0);
    expect(result.best!.total).toBeGreaterThan(result.best!.itemsTotal);
  });

  it("never scores worse than buying each item at its own lowest price", () => {
    // Compared on rankScore, not the displayed total: displayed totals omit
    // shipping we cannot price, so plans with different numbers of unpriced
    // orders are not comparable on that figure.
    expect(result.best!.rankScore).toBeLessThanOrEqual(result.naive!.rankScore + 0.01);
  });

  it("consolidates into fewer orders than the naive split", () => {
    expect(result.fewerOrders).toBeGreaterThan(0);
    expect(result.best!.stores.length).toBeLessThan(result.naive!.stores.length);
  });

  it("does not quote a dollar saving it cannot substantiate", () => {
    // This basket includes retailers with no published shipping policy.
    if (result.best!.unpricedShipping.length > 0) {
      expect(result.saving).toBeNull();
    }
  });

  it("considers only retailers that carry something in the basket", () => {
    expect(result.consideredRetailers).toBeGreaterThan(0);
    expect(result.consideredRetailers).toBeLessThan(72);
  });

  it("does not silently price shipping it cannot know", () => {
    for (const store of result.best!.stores) {
      if (!store.shippingKnown) {
        expect(store.shipping).toBeNull();
        expect(result.best!.unpricedShipping).toContain(store.retailer);
      }
    }
  });
});
