import { selectMovers } from "../lib/movers";
import type { Product } from "../lib/products";


describe("movers and stock", () => {
  const moved = (key: string, change: number, inStock: boolean, others: boolean[] = []) =>
    ({
      group_key: key, name: key, price: 100, retailer: "Shop", url: "",
      is_preorder: false, updated: "2026-09-01T00:00:00Z", all_time_low: 50,
      price_change_7d: change, history: Array.from({ length: 40 }, (_, i) => ({
        date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`,
        price: 100,
      })),
      history_days: 40, price_change_1d: null, price_change_30d: null,
      pack_count: null, price_per_pack: null, image_url: "",
      other_retailers: others.map((in_stock) => ({
        retailer: "O", price: 110, url: "", in_stock, stock_qty: null,
      })),
      is_new: false, in_stock: inStock, back_in_stock: false, language: "English",
      product_type: "Booster Box", set_name: "S", variant: "", category: "sealed",
      msrp: null, deal_score: 50, last_restock_date: null,
    }) as never;

  it("drops a faller that sold out everywhere", () => {
    // It would otherwise lead the page, pointing at something nobody can buy.
    const { fallers } = selectMovers([moved("gone", -30, false)] as Product[]);
    expect(fallers).toHaveLength(0);
  });

  it("keeps a faller still stocked at another retailer", () => {
    const { fallers } = selectMovers([moved("alive", -30, false, [true])] as Product[]);
    expect(fallers.map((p: Product) => p.group_key)).toEqual(["alive"]);
  });

  it("keeps an in-stock faller", () => {
    const { fallers } = selectMovers([moved("here", -30, true)] as Product[]);
    expect(fallers.map((p: Product) => p.group_key)).toEqual(["here"]);
  });

  it("drops a sold-out riser too", () => {
    const { risers } = selectMovers([moved("up", 30, false)] as Product[]);
    expect(risers).toHaveLength(0);
  });
});
