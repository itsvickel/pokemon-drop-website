import {
  changeOver,
  pricePerPack,
  priceVerdict,
  roiSinceFirstSeen,
  OUT_OF_PRINT_DAYS,
} from "../lib/insights";
import { selectMovers, setSlug, setsWithCounts, findSetBySlug, MIN_PRICE, MAX_CREDIBLE_MOVE_PCT } from "../lib/movers";
import type { Product, HistoryEntry } from "../lib/products";
import { computePackCount } from "../lib/packCount";

const NOW = new Date("2026-09-07T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const h = (n: number, price: number): HistoryEntry => ({ date: daysAgo(n), price, retailer: "X" });

function product(over: Partial<Product> = {}): Product {
  return {
    group_key: "k", name: "Thing", price: 100, retailer: "401 Games", url: "",
    is_preorder: false, updated: "", all_time_low: 90, price_change_7d: null,
    history: [], history_days: 90, price_change_1d: null, price_change_30d: null,
    pack_count: null, price_per_pack: null, image_url: "", other_retailers: [],
    is_new: false, in_stock: true, back_in_stock: false, language: "English",
    product_type: "Booster Box", set_name: "Bloomburrow", variant: "",
    category: "sealed", msrp: null, deal_score: 50, last_restock_date: null,
    ...over,
  };
}

describe("pricePerPack", () => {
  it("divides by the pack count", () => {
    expect(pricePerPack(180, 36)).toBeCloseTo(5);
  });
  it("refuses to guess when the count is unknown", () => {
    // Secret Lairs and Commander decks have no meaningful pack count.
    expect(pricePerPack(180, null)).toBeNull();
  });
  it("rejects a count of one, which is not a normalisation", () => {
    expect(pricePerPack(180, 1)).toBeNull();
  });
  it("rejects a nonsensical price", () => {
    expect(pricePerPack(0, 36)).toBeNull();
  });
});

describe("changeOver", () => {
  it("computes change against the oldest point inside the window", () => {
    const entries = [h(30, 100), h(20, 110), h(1, 120)];
    expect(changeOver(entries, 120, 30, NOW)).toBeCloseTo(20);
  });

  it("returns null when the window is not meaningfully covered", () => {
    // Two days of data must not be reported as a 30-day trend.
    const entries = [h(2, 100), h(1, 120)];
    expect(changeOver(entries, 120, 30, NOW)).toBeNull();
  });

  it("returns null rather than zero when there is no history", () => {
    expect(changeOver([], 100, 7, NOW)).toBeNull();
    expect(changeOver(undefined, 100, 7, NOW)).toBeNull();
  });

  it("reports a fall as negative", () => {
    expect(changeOver([h(7, 200), h(1, 150)], 150, 7, NOW)).toBeLessThan(0);
  });

  it("ignores points outside the window", () => {
    const entries = [h(90, 10), h(7, 100), h(1, 110)];
    const change = changeOver(entries, 110, 7, NOW);
    expect(change).not.toBeNull();
    expect(change!).toBeLessThan(100); // not measured against the $10 point
  });
});

describe("priceVerdict", () => {
  const steady = [h(60, 80), h(40, 120), h(20, 100), h(1, 100)]; // avg 100, min 80

  it("declines to judge without enough tracked history", () => {
    expect(priceVerdict(100, [h(3, 100), h(1, 100)], NOW).tone).toBe("unknown");
  });

  it("calls out the cheapest price seen", () => {
    const v = priceVerdict(75, [...steady, h(0, 75)], NOW);
    expect(v.tone).toBe("great");
    expect(v.label).toMatch(/Lowest/);
  });

  it("flags a meaningful discount to the average", () => {
    expect(priceVerdict(85, steady, NOW).tone).toBe("good");
  });

  it("warns when a price is above average", () => {
    const v = priceVerdict(130, steady, NOW);
    expect(v.tone).toBe("high");
    expect(v.detail).toMatch(/waiting/);
  });

  it("says typical when it is typical", () => {
    expect(priceVerdict(101, steady, NOW).tone).toBe("typical");
  });

  it("never judges against MSRP, which is null on every product", () => {
    // Guards the design decision: the verdict uses observed history only.
    expect(priceVerdict(85, steady, NOW).detail).not.toMatch(/msrp/i);
  });
});

describe("roiSinceFirstSeen", () => {
  it("measures from the first observation", () => {
    const roi = roiSinceFirstSeen(150, [h(60, 100), h(1, 150)], undefined, NOW);
    expect(roi!.pct).toBeCloseTo(50);
    expect(roi!.days).toBeGreaterThanOrEqual(59);
  });

  it("returns null on too little history", () => {
    expect(roiSinceFirstSeen(150, [h(2, 100), h(1, 150)], undefined, NOW)).toBeNull();
  });

  it("flags a set old enough to be out of print", () => {
    const old = new Date(NOW.getTime() - (OUT_OF_PRINT_DAYS + 30) * 86_400_000)
      .toISOString().slice(0, 10);
    expect(roiSinceFirstSeen(150, [h(60, 100), h(1, 150)], old, NOW)!.likelyOutOfPrint).toBe(true);
  });

  it("does not flag a recent set", () => {
    expect(roiSinceFirstSeen(150, [h(60, 100), h(1, 150)], daysAgo(30), NOW)!.likelyOutOfPrint).toBe(false);
  });
});

describe("selectMovers", () => {
  const mk = (over: Partial<Product>) => product({ history: [h(60, 1), h(1, 1)], ...over });

  it("splits risers from fallers", () => {
    const m = selectMovers([
      mk({ group_key: "up", price_change_7d: 20 }),
      mk({ group_key: "down", price_change_7d: -20 }),
    ]);
    expect(m.risers[0].group_key).toBe("up");
    expect(m.fallers[0].group_key).toBe("down");
  });

  it("ignores cheap products where a big percent is small money", () => {
    expect(selectMovers([mk({ price: MIN_PRICE - 1, price_change_7d: 40 })]).risers).toHaveLength(0);
  });

  it("ignores moves too small to be interesting", () => {
    expect(selectMovers([mk({ price_change_7d: 2 })]).risers).toHaveLength(0);
  });

  it("rejects implausible swings, which are almost always bad data", () => {
    // A 3000% move in this dataset means regrouping, not a price change.
    expect(selectMovers([mk({ price_change_7d: MAX_CREDIBLE_MOVE_PCT + 1 })]).risers).toHaveLength(0);
  });

  it("ignores products we have barely tracked", () => {
    expect(selectMovers([mk({ price_change_7d: 20, history_days: 3 })]).risers).toHaveLength(0);
  });

  it("supports other windows", () => {
    const m = selectMovers([mk({ price_change_30d: 30 })], "price_change_30d");
    expect(m.risers).toHaveLength(1);
  });

  it("handles an empty catalogue", () => {
    expect(selectMovers([])).toEqual({ risers: [], fallers: [] });
  });
});

describe("set index", () => {
  it("counts sealed products per set and tracks the cheapest", () => {
    const rows = setsWithCounts([
      product({ set_name: "Bloomburrow", price: 100 }),
      product({ set_name: "Bloomburrow", price: 60 }),
      product({ set_name: "Aetherdrift", price: 80 }),
    ]);
    expect(rows[0]).toEqual({ set: "Bloomburrow", count: 2, cheapest: 60 });
  });

  it("excludes singles from set pages", () => {
    expect(setsWithCounts([product({ set_name: "X", category: "single" })])).toHaveLength(0);
  });

  it("slugs and resolves set names", () => {
    expect(setSlug("Universes Beyond: Final Fantasy")).toBe("universes-beyond-final-fantasy");
    const products = [product({ set_name: "Universes Beyond: Final Fantasy" })];
    expect(findSetBySlug(products, "universes-beyond-final-fantasy")).toBe("Universes Beyond: Final Fantasy");
    expect(findSetBySlug(products, "nope")).toBeNull();
  });
});

describe("computePackCount — year confusion", () => {
  it("does not read a set year as a booster count", () => {
    // "Modern Masters 2017 - Booster Pack" matched 2017 packs, which made
    // price-per-pack come out at one cent.
    expect(computePackCount("MTG - Modern Masters 2017 - Booster Pack")).not.toBe(2017);
    expect(computePackCount("Magic: The Gathering Jumpstart 2020 - Booster Box")).toBe(36);
    expect(computePackCount("MTG - Core Set 2019 - Booster Box - Japanese")).toBe(36);
  });

  it("still reads a genuine explicit count", () => {
    expect(computePackCount("Pokemon Booster Bundle 6 Packs")).toBe(6);
    expect(computePackCount("Scarlet & Violet 12 Boosters")).toBe(12);
  });

  it("still falls back to known product shapes", () => {
    expect(computePackCount("Bloomburrow Booster Box")).toBe(36);
    expect(computePackCount("Surging Sparks Elite Trainer Box")).toBe(9);
  });

  it("returns null when there is nothing to go on", () => {
    expect(computePackCount("Secret Lair Drop Series: Rad Superdrop")).toBeNull();
  });

  it("rejects an implausibly large count", () => {
    expect(computePackCount("Bulk lot 5000 boosters")).toBeNull();
  });
});
