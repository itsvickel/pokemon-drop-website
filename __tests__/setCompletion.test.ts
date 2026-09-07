import { MIN_CARDS_TO_TRACK, setProgress } from "../lib/setCompletion";
import type { Product, SetInfo } from "../lib/products";
import type { ValuedHolding } from "../lib/collection";

const card = (setCode: string, num: string, name = `C${num}`) => ({
  scryfall_id: `s-${setCode}-${num}`, card_name: name, set_code: setCode,
  set_name: setCode.toUpperCase() + " Set", collector_number: num,
  image_url: "", scryfall_uri: "", treatment: "", market_usd: null,
  market_cad: null, approximate: false,
});

const product = (key: string, setCode: string | null, num = "1"): Product =>
  ({ group_key: key, name: key, card: setCode ? card(setCode, num) : undefined } as unknown as Product);

const holding = (key: string, p: Product | undefined, value = 0): ValuedHolding =>
  ({ group_key: key, product_name: key, tcg: "mtg", quantity: 1, unit_cost: null,
     purchased_at: null, marketPrice: null, marketValue: value, costTotal: null,
     gain: null, gainPct: null, product: p } as ValuedHolding);

const sets = (total: number, name = "BLB Set"): Record<string, SetInfo> =>
  ({ blb: { name, total, released_at: "2024-08-02", set_type: "expansion", digital: false } });

describe("setProgress", () => {
  it("measures against the real set size, not our coverage", () => {
    // The point of fetching set totals: 2 of 261, not 2 of 2.
    const ps = [product("a", "blb", "1"), product("b", "blb", "2")];
    const rows = setProgress(ps.map((p) => holding(p.group_key, p)), sets(261), ps);
    expect(rows[0].total).toBe(261);
    expect(rows[0].owned).toBe(2);
    expect(rows[0].percent).toBe(1);
    expect(rows[0].totalIsComplete).toBe(true);
  });

  it("counts a card once however many copies are held", () => {
    const p = product("a", "blb", "1");
    const rows = setProgress([holding("a", p), holding("a", p), holding("a", p)], sets(100), [p]);
    expect(rows[0].owned).toBe(1);
  });

  it("still sums value across every copy", () => {
    const p = product("a", "blb", "1");
    const rows = setProgress([holding("a", p, 10), holding("a", p, 10)], sets(100), [p]);
    expect(rows[0].marketValue).toBe(20);
  });

  it("treats different collector numbers as different cards", () => {
    const ps = [product("a", "blb", "1"), product("b", "blb", "2")];
    const rows = setProgress(ps.map((p) => holding(p.group_key, p)), sets(100), ps);
    expect(rows[0].owned).toBe(2);
  });

  it("falls back to what we track when the set size is unknown", () => {
    const ps = [product("a", "xyz", "1"), product("b", "xyz", "2"), product("c", "xyz", "3")];
    const rows = setProgress([holding("a", ps[0])], undefined, ps);
    expect(rows[0].total).toBe(3);
    expect(rows[0].totalIsComplete).toBe(false);
  });

  it("flags the fallback denominator so the UI can caveat it", () => {
    const ps = [product("a", "xyz", "1"), product("b", "xyz", "2")];
    const rows = setProgress([holding("a", ps[0])], sets(261), ps);
    expect(rows[0].totalIsComplete).toBe(false);
  });

  it("never reports more than 100% complete", () => {
    // Our card list can disagree with Scryfall's total — a promo matched into
    // the set, say — and 150% reads as a bug rather than a bonus.
    const ps = [product("a", "blb", "1"), product("b", "blb", "2"), product("c", "blb", "3")];
    const rows = setProgress(ps.map((p) => holding(p.group_key, p)), sets(2), ps);
    expect(rows[0].percent).toBe(100);
  });

  it("reports a finished set as 100%", () => {
    const ps = [product("a", "blb", "1"), product("b", "blb", "2")];
    const rows = setProgress(ps.map((p) => holding(p.group_key, p)), sets(2), ps);
    expect(rows[0].percent).toBe(100);
  });

  it("ignores holdings with no card data, such as sealed product", () => {
    expect(setProgress([holding("a", product("a", null))], sets(100), [])).toEqual([]);
  });

  it("ignores holdings whose product is no longer tracked", () => {
    expect(setProgress([holding("a", undefined)], sets(100), [])).toEqual([]);
  });

  it(`skips sets smaller than ${MIN_CARDS_TO_TRACK} cards`, () => {
    const p = product("a", "xyz", "1");
    expect(setProgress([holding("a", p)], undefined, [p])).toEqual([]);
  });

  it("puts the nearest-to-finished set first", () => {
    const ps = [product("a", "blb", "1"), product("b", "mh3", "1")];
    const both: Record<string, SetInfo> = {
      ...sets(2), mh3: { name: "MH3", total: 300, released_at: "", set_type: "", digital: false },
    };
    const rows = setProgress(ps.map((p) => holding(p.group_key, p)), both, ps);
    expect(rows.map((r) => r.setCode)).toEqual(["blb", "mh3"]);
  });

  it("matches set codes case-insensitively", () => {
    const p = product("a", "BLB", "1");
    const rows = setProgress([holding("a", p)], sets(261), [p]);
    expect(rows[0].total).toBe(261);
  });

  it("prefers Scryfall's set name over the one on the card", () => {
    const p = product("a", "blb", "1");
    const rows = setProgress([holding("a", p)], sets(261, "Bloomburrow"), [p]);
    expect(rows[0].setName).toBe("Bloomburrow");
  });

  it("returns nothing for an empty collection", () => {
    expect(setProgress([], sets(261), [])).toEqual([]);
  });
});
