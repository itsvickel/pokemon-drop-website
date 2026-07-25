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
