import { conflictsWithGroup, sizeClass } from "../lib/sizeClass";

describe("sizeClass", () => {
  it("reads the unit from a listing name", () => {
    expect(sizeClass("MTG - Foundations - English Play Booster Pack")).toBe("pack");
    expect(sizeClass("MTG - Foundations - English Play Booster Box")).toBe("box");
  });

  it("reads the unit from a group key", () => {
    expect(sizeClass("booster box foundations mtg play")).toBe("box");
  });

  it("prefers the more specific unit", () => {
    // Taking the first word seen would call this a box, letting one box
    // undercut a case.
    expect(sizeClass("Booster Box Case")).toBe("case");
  });

  it("matches plurals", () => {
    expect(sizeClass("Two Booster Boxes")).toBe("box");
  });

  it("returns null when nothing names a unit", () => {
    expect(sizeClass("Bloomburrow")).toBeNull();
  });

  it("handles null and empty input", () => {
    expect(sizeClass(null)).toBeNull();
    expect(sizeClass("")).toBeNull();
  });

  it("does not match a unit inside another word", () => {
    expect(sizeClass("Boxer Rebellion Promo")).toBeNull();
  });

  it("is case insensitive", () => {
    expect(sizeClass("BOOSTER BOX")).toBe("box");
  });
});

describe("conflictsWithGroup", () => {
  const BOX_GROUP = "booster box foundations mtg play";

  it("flags a pack inside a box group", () => {
    // The live bug: this listing was pricing a booster box at $6.95.
    expect(conflictsWithGroup("MTG - Foundations - Play Booster Pack", BOX_GROUP)).toBe(true);
  });

  it("accepts a box inside a box group", () => {
    expect(conflictsWithGroup("MTG - Foundations - Play Booster Box", BOX_GROUP)).toBe(false);
  });

  it("accepts a listing that names no unit", () => {
    // The group key already says what the group is; most listings do not
    // repeat it, and dropping them would empty real groups.
    expect(conflictsWithGroup("Foundations", BOX_GROUP)).toBe(false);
  });

  it("never conflicts when the group names no unit", () => {
    expect(conflictsWithGroup("Booster Pack", "bloomburrow")).toBe(false);
    expect(conflictsWithGroup("Booster Box", "bloomburrow")).toBe(false);
  });

  it("flags a case inside a box group", () => {
    expect(conflictsWithGroup("Foundations Booster Box Case", BOX_GROUP)).toBe(true);
  });

  it("treats an empty listing name as no conflict", () => {
    expect(conflictsWithGroup("", BOX_GROUP)).toBe(false);
  });
});

describe("named product lines", () => {
  it("treats a Checklane as a blister, not an unlabelled listing", () => {
    // EB Games lists it as "Chaos Rising Checklane Booster" with no size word,
    // so it sat inside a booster-box group at $8.99 against $242 and $325.
    expect(sizeClass("Pokemon TCG: Mega Evolution Chaos Rising Checklane Booster")).toBe("blister");
    expect(conflictsWithGroup(
      "Pokemon TCG: Mega Evolution Chaos Rising Checklane Booster",
      "booster box chaos evolution mega rising",
    )).toBe(true);
  });

  it("treats an ETB as a box", () => {
    expect(sizeClass("Scarlet & Violet ETB")).toBe("box");
  });

  it("still prefers an explicit size word over a synonym", () => {
    expect(sizeClass("Checklane Booster Box")).toBe("box");
  });
});
