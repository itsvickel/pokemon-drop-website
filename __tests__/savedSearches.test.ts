import {
  MAX_SAVED, addSaved, cleanName, forGame, parseSaved, removeSaved,
  type SavedSearch,
} from "../lib/savedSearches";

const entry = (href: string, name = "n", tcg = "mtg") => ({
  id: `id-${href}`, href, name, tcg, createdAt: "2026-01-01T00:00:00.000Z",
});

const saved = (href: string, tcg = "mtg"): SavedSearch =>
  ({ ...entry(href, "n", tcg) });

describe("parseSaved", () => {
  it("returns an empty list for missing storage", () => {
    expect(parseSaved(null)).toEqual([]);
  });

  it("survives corrupt JSON rather than throwing", () => {
    expect(parseSaved("{not json")).toEqual([]);
  });

  it("rejects a non-array payload", () => {
    expect(parseSaved(JSON.stringify({ href: "/mtg" }))).toEqual([]);
  });

  it("drops entries missing required fields", () => {
    const raw = JSON.stringify([
      saved("/mtg/sealed?q=a"),
      { id: "x", name: "no href" },
      null,
    ]);
    expect(parseSaved(raw)).toHaveLength(1);
  });

  it("round-trips a valid list", () => {
    const list = [saved("/a"), saved("/b")];
    expect(parseSaved(JSON.stringify(list))).toEqual(list);
  });
});

describe("cleanName", () => {
  it("falls back when the name is blank", () => {
    expect(cleanName("   ")).toBe("Untitled search");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanName("  Japanese sealed  ")).toBe("Japanese sealed");
  });

  it("caps length so the chip stays on one line", () => {
    expect(cleanName("x".repeat(200))).toHaveLength(40);
  });
});

describe("addSaved", () => {
  it("puts the newest first", () => {
    const list = addSaved(addSaved([], entry("/a")), entry("/b"));
    expect(list.map((s) => s.href)).toEqual(["/b", "/a"]);
  });

  it("renames rather than duplicating when the href repeats", () => {
    const first = addSaved([], entry("/a", "Old name"));
    const second = addSaved(first, entry("/a", "New name"));
    expect(second).toHaveLength(1);
    expect(second[0].name).toBe("New name");
  });

  it("keeps distinct hrefs apart even when names collide", () => {
    const list = addSaved(addSaved([], entry("/a", "same")), entry("/b", "same"));
    expect(list).toHaveLength(2);
  });

  it("caps the list, discarding the oldest", () => {
    let list: SavedSearch[] = [];
    for (let i = 0; i < MAX_SAVED + 5; i++) list = addSaved(list, entry(`/p${i}`));
    expect(list).toHaveLength(MAX_SAVED);
    expect(list.some((s) => s.href === "/p0")).toBe(false);
    expect(list[0].href).toBe(`/p${MAX_SAVED + 4}`);
  });

  it("applies the blank-name fallback on the way in", () => {
    expect(addSaved([], entry("/a", ""))[0].name).toBe("Untitled search");
  });
});

describe("removeSaved", () => {
  it("removes only the requested id", () => {
    const list = addSaved(addSaved([], entry("/a")), entry("/b"));
    expect(removeSaved(list, "id-/a").map((s) => s.href)).toEqual(["/b"]);
  });

  it("is a no-op for an unknown id", () => {
    const list = addSaved([], entry("/a"));
    expect(removeSaved(list, "nope")).toEqual(list);
  });
});

describe("forGame", () => {
  it("keeps each game's searches on its own pages", () => {
    const list = [saved("/mtg/sealed", "mtg"), saved("/pokemon/sealed", "pokemon")];
    expect(forGame(list, "pokemon").map((s) => s.href)).toEqual(["/pokemon/sealed"]);
  });

  it("returns nothing for a game with no saved searches", () => {
    expect(forGame([saved("/mtg", "mtg")], "pokemon")).toEqual([]);
  });
});
