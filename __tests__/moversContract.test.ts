/**
 * Contract test for the movers and set pages, against REAL feed output.
 *
 * The pages are client-rendered, so a schema change on the Python side would
 * typecheck cleanly here and only fail in the browser. The fixture is trimmed
 * from a live /api/products response; regenerate it when the crawler changes.
 */
import { selectMovers, setsWithCounts, setSlug, findSetBySlug, MIN_PRICE } from "../lib/movers";
import { priceVerdict, changeOver } from "../lib/insights";
import { deliveredPrice } from "../lib/shipping";
import { sizedImage, THUMB } from "../lib/images";
import type { Product } from "../lib/products";
import fixture from "./fixtures/products.mtg.json";

const products = (fixture as { products: Product[] }).products;

describe("real feed shape", () => {
  it("carries every field the new pages read", () => {
    for (const p of products) {
      expect(typeof p.group_key).toBe("string");
      expect(typeof p.price).toBe("number");
      expect(typeof p.retailer).toBe("string");
      expect(p).toHaveProperty("price_change_1d");
      expect(p).toHaveProperty("price_change_7d");
      expect(p).toHaveProperty("price_change_30d");
      expect(p).toHaveProperty("pack_count");
      expect(p).toHaveProperty("price_per_pack");
      expect(typeof p.history_days).toBe("number");
    }
  });

  it("never reports a year as a pack count", () => {
    for (const p of products) {
      if (p.pack_count === null) continue;
      expect(p.pack_count).toBeGreaterThan(1);
      expect(p.pack_count).toBeLessThan(400);
      expect(p.pack_count < 1900 || p.pack_count > 2099).toBe(true);
    }
  });

  it("keeps price_per_pack consistent with price and pack_count", () => {
    for (const p of products) {
      if (p.price_per_pack === null || p.pack_count === null) continue;
      expect(p.price_per_pack).toBeCloseTo(p.price / p.pack_count, 5);
    }
  });
});

describe("movers over real data", () => {
  const movers = selectMovers(products);

  it("produces both directions without overlap", () => {
    const ids = new Set([...movers.risers, ...movers.fallers].map((p) => p.group_key));
    expect(ids.size).toBe(movers.risers.length + movers.fallers.length);
  });

  it("only includes products above the price floor", () => {
    for (const p of [...movers.risers, ...movers.fallers]) {
      expect(p.price).toBeGreaterThanOrEqual(MIN_PRICE);
    }
  });

  it("orders fallers most-negative first and risers most-positive first", () => {
    const f = movers.fallers.map((p) => p.price_change_7d ?? 0);
    const r = movers.risers.map((p) => p.price_change_7d ?? 0);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect([...r].sort((a, b) => b - a)).toEqual(r);
  });

  it("puts fallers below zero and risers above", () => {
    movers.fallers.forEach((p) => expect(p.price_change_7d!).toBeLessThan(0));
    movers.risers.forEach((p) => expect(p.price_change_7d!).toBeGreaterThan(0));
  });
});

describe("set pages over real data", () => {
  it("indexes sets and round-trips every slug", () => {
    const sets = setsWithCounts(products);
    expect(sets.length).toBeGreaterThan(0);
    for (const s of sets) {
      expect(findSetBySlug(products, setSlug(s.set))).toBe(s.set);
      expect(s.count).toBeGreaterThan(0);
      expect(s.cheapest).toBeGreaterThan(0);
    }
  });

  it("produces URL-safe slugs", () => {
    for (const s of setsWithCounts(products)) {
      expect(setSlug(s.set)).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("per-product rendering helpers survive real rows", () => {
  it("never throws on a real product", () => {
    for (const p of products) {
      expect(() => priceVerdict(p.price, p.history)).not.toThrow();
      expect(() => deliveredPrice(p.price, p.retailer)).not.toThrow();
      expect(() => sizedImage(p.image_url, THUMB)).not.toThrow();
      expect(() => changeOver(p.history, p.price, 7)).not.toThrow();
    }
  });

  it("returns a usable image URL or an empty string, never undefined", () => {
    for (const p of products) {
      expect(typeof sizedImage(p.image_url, THUMB)).toBe("string");
    }
  });
});
