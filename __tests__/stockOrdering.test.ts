import { buyableFirst, isSoldOutEverywhere } from "../lib/products";

type P = { name: string; price: number; in_stock: boolean; other_retailers: { in_stock: boolean }[] };

const p = (name: string, price: number, in_stock: boolean, others: boolean[] = []): P =>
  ({ name, price, in_stock, other_retailers: others.map((in_stock) => ({ in_stock })) });

const byPrice = (a: P, b: P) => a.price - b.price;

describe("isSoldOutEverywhere", () => {
  it("is false when the best listing is in stock", () => {
    expect(isSoldOutEverywhere(p("a", 10, true))).toBe(false);
  });

  it("is false when only another retailer has it", () => {
    expect(isSoldOutEverywhere(p("a", 10, false, [false, true]))).toBe(false);
  });

  it("is true when no retailer has it", () => {
    expect(isSoldOutEverywhere(p("a", 10, false, [false, false]))).toBe(true);
  });

  it("is true for a single sold-out listing with no other retailers", () => {
    expect(isSoldOutEverywhere(p("a", 10, false))).toBe(true);
  });
});

describe("buyableFirst", () => {
  it("keeps a cheap sold-out listing out of the top slot", () => {
    // The case the crawler change introduced: a sold-out group keeps its last
    // known price, which is often the lowest price the product ever had.
    const items = [p("sold out", 5, false), p("buyable", 20, true)];
    items.sort(buyableFirst(byPrice));
    expect(items.map((i) => i.name)).toEqual(["buyable", "sold out"]);
  });

  it("still sorts buyable listings by the wrapped comparator", () => {
    const items = [p("c", 30, true), p("a", 10, true), p("b", 20, true)];
    items.sort(buyableFirst(byPrice));
    expect(items.map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("sorts sold-out listings among themselves too", () => {
    const items = [p("expensive", 30, false), p("cheap", 10, false)];
    items.sort(buyableFirst(byPrice));
    expect(items.map((i) => i.name)).toEqual(["cheap", "expensive"]);
  });

  it("treats stock at any retailer as buyable", () => {
    const items = [p("dead", 5, false, [false]), p("alive elsewhere", 40, false, [true])];
    items.sort(buyableFirst(byPrice));
    expect(items[0].name).toBe("alive elsewhere");
  });

  it("puts every buyable item ahead of every sold-out one", () => {
    const items = [
      p("out-cheap", 1, false), p("in-dear", 99, true),
      p("out-dear", 98, false), p("in-cheap", 2, true),
    ];
    items.sort(buyableFirst(byPrice));
    expect(items.map((i) => i.name)).toEqual(["in-cheap", "in-dear", "out-cheap", "out-dear"]);
  });

  it("reverses correctly when the wrapped comparator is descending", () => {
    const items = [p("out", 100, false), p("in", 10, true)];
    items.sort(buyableFirst((a, b) => b.price - a.price));
    expect(items.map((i) => i.name)).toEqual(["in", "out"]);
  });
});
