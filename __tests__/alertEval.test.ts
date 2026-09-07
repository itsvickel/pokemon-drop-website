import { evaluateAlerts, type EvalAlert, type EvalProduct } from "../lib/alertEval";

const NOW = new Date("2026-07-25T12:00:00Z");

function alert(overrides: Partial<EvalAlert>): EvalAlert {
  return {
    id: "a1",
    tcg: "pokemon",
    group_key: "journey together etb",
    product_name: "Journey Together ETB",
    email: "buyer@example.com",
    threshold: 60,
    active: true,
    last_triggered: null,
    ...overrides,
  };
}

function product(overrides: Partial<EvalProduct>): EvalProduct {
  return {
    group_key: "journey together etb",
    name: "Journey Together Elite Trainer Box",
    price: 55,
    retailer: "401 Games",
    url: "https://example.com/p",
    in_stock: true,
    ...overrides,
  };
}

function productsMap(...products: EvalProduct[]): Map<string, EvalProduct> {
  return new Map(products.map((p) => [p.group_key, p]));
}

describe("evaluateAlerts", () => {
  test("triggers when price is at or below threshold and in stock", () => {
    const hits = evaluateAlerts([alert({})], productsMap(product({})), NOW);
    expect(hits).toHaveLength(1);
    expect(hits[0].alert.id).toBe("a1");
    expect(hits[0].product.price).toBe(55);
  });

  test("does not trigger above threshold", () => {
    const hits = evaluateAlerts([alert({})], productsMap(product({ price: 61 })), NOW);
    expect(hits).toHaveLength(0);
  });

  test("does not trigger when out of stock", () => {
    const hits = evaluateAlerts([alert({})], productsMap(product({ in_stock: false })), NOW);
    expect(hits).toHaveLength(0);
  });

  test("skips inactive alerts and unknown products", () => {
    const hits = evaluateAlerts(
      [alert({ active: false }), alert({ id: "a2", group_key: "unknown" })],
      productsMap(product({})),
      NOW
    );
    expect(hits).toHaveLength(0);
  });

  test("respects the cooldown window", () => {
    const recent = alert({ last_triggered: "2026-07-25T02:00:00Z" }); // 10h ago
    const old = alert({ id: "a2", last_triggered: "2026-07-24T02:00:00Z" }); // 34h ago
    const hits = evaluateAlerts([recent, old], productsMap(product({})), NOW, 24);
    expect(hits.map((h) => h.alert.id)).toEqual(["a2"]);
  });
});

describe("alert kinds beyond a fixed price", () => {
  const NOW = new Date("2026-09-07T12:00:00Z");

  const alert = (over: Partial<EvalAlert> = {}): EvalAlert => ({
    id: "a", tcg: "mtg", group_key: "k", product_name: "Thing",
    email: "x@y.co", threshold: 0, active: true, last_triggered: null, ...over,
  });

  const product = (over: Partial<EvalProduct> = {}): EvalProduct => ({
    group_key: "k", name: "Thing", price: 100, retailer: "401 Games",
    url: "https://x", in_stock: true, ...over,
  });

  const run = (a: EvalAlert, p: EvalProduct) =>
    evaluateAlerts([a], new Map([[p.group_key, p]]), NOW);

  it("treats an alert with no kind as a price alert, so old ones keep working", () => {
    const fired = run(alert({ threshold: 120 }), product({ price: 100 }));
    expect(fired).toHaveLength(1);
    expect(fired[0].reason).toMatch(/target/);
  });

  describe("percent", () => {
    const pct = (over: Partial<EvalAlert> = {}) =>
      alert({ kind: "percent", percent: 15, baseline_price: 100, ...over });

    it("fires once the drop reaches the target", () => {
      const fired = run(pct(), product({ price: 84 }));
      expect(fired).toHaveLength(1);
      expect(fired[0].reason).toMatch(/down 16%/);
    });

    it("stays quiet on a smaller drop", () => {
      expect(run(pct(), product({ price: 90 }))).toHaveLength(0);
    });

    it("cannot fire without a baseline to measure from", () => {
      // Inventing one would fire on the first run for everything.
      expect(run(pct({ baseline_price: undefined }), product({ price: 10 }))).toHaveLength(0);
    });
  });

  describe("restock", () => {
    it("fires only on the transition back into stock", () => {
      const fired = run(alert({ kind: "restock", was_in_stock: false }), product({ in_stock: true }));
      expect(fired).toHaveLength(1);
      expect(fired[0].reason).toMatch(/back in stock/);
    });

    it("stays quiet for something that never went out of stock", () => {
      // Otherwise it would email every run for anything permanently available.
      expect(run(alert({ kind: "restock", was_in_stock: true }), product({ in_stock: true }))).toHaveLength(0);
    });

    it("stays quiet while still out of stock", () => {
      expect(run(alert({ kind: "restock", was_in_stock: false }), product({ in_stock: false }))).toHaveLength(0);
    });
  });

  describe("any_low", () => {
    const low = alert({ kind: "any_low" });

    it("fires at the lowest tracked price", () => {
      const fired = run(low, product({ price: 50, all_time_low: 50, history_days: 60 }));
      expect(fired).toHaveLength(1);
      expect(fired[0].reason).toMatch(/lowest tracked price/);
    });

    it("stays quiet above the low", () => {
      expect(run(low, product({ price: 60, all_time_low: 50, history_days: 60 }))).toHaveLength(0);
    });

    it("refuses to call a low meaningful on days of history", () => {
      expect(run(low, product({ price: 50, all_time_low: 50, history_days: 3 }))).toHaveLength(0);
    });
  });

  it("applies the cooldown to every kind", () => {
    // The fastest way to make someone disable alerts is to send the same one twice.
    const recent = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    for (const kind of ["price", "percent", "restock", "any_low"] as const) {
      const a = alert({
        kind, threshold: 200, percent: 1, baseline_price: 100,
        was_in_stock: false, last_triggered: recent,
      });
      expect(run(a, product({ price: 10, all_time_low: 10, history_days: 60 }))).toHaveLength(0);
    }
  });

  it("never fires on an out-of-stock product", () => {
    for (const kind of ["price", "percent", "any_low"] as const) {
      const a = alert({ kind, threshold: 200, percent: 1, baseline_price: 100 });
      expect(run(a, product({ price: 10, in_stock: false, all_time_low: 10, history_days: 60 }))).toHaveLength(0);
    }
  });

  it("always explains why it fired", () => {
    // An alert email that cannot explain itself is indistinguishable from spam.
    const fired = run(alert({ threshold: 200 }), product({ price: 100 }));
    expect(fired[0].reason.length).toBeGreaterThan(10);
  });
});
