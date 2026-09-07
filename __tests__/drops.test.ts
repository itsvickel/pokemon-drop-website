import {
  TBA_DATE,
  bestListing,
  confidenceBand,
  countdownTo,
  daysUntil,
  formatCountdown,
  formatReleaseDate,
  isDated,
  isLiveNow,
  sectionDrops,
  type Drop,
  type Listing,
} from "../lib/drops";

const NOW = new Date("2026-09-07T12:00:00Z");

function makeDrop(overrides: Partial<Drop> = {}): Drop {
  return {
    id: "mtg-set-example",
    game: "mtg",
    kind: "set",
    name: "Example Set",
    release_date: "2026-10-01",
    where: [],
    confidence: { score: 85, label: "Likely", signals: [] },
    sources: ["scryfall"],
    ...overrides,
  };
}

function listing(overrides: Partial<Listing> = {}): Listing {
  return { retailer: "401 Games", status: "coming_soon", url: "https://x/1", ...overrides };
}

describe("isDated", () => {
  it("treats the TBA sentinel as undated", () => {
    expect(isDated(makeDrop({ release_date: TBA_DATE }))).toBe(false);
  });

  it("treats a real date as dated", () => {
    expect(isDated(makeDrop())).toBe(true);
  });
});

describe("daysUntil", () => {
  it("counts forward", () => {
    expect(daysUntil("2026-09-17", NOW)).toBe(10);
  });

  it("counts backward for past dates", () => {
    expect(daysUntil("2026-09-01", NOW)).toBe(-6);
  });

  it("returns zero on the day itself", () => {
    expect(daysUntil("2026-09-07", NOW)).toBe(0);
  });
});

describe("countdownTo", () => {
  it("breaks a future instant into parts", () => {
    const c = countdownTo("2026-09-09T14:30:00Z", NOW);
    expect(c.past).toBe(false);
    expect(c.days).toBe(2);
    expect(c.hours).toBe(2);
    expect(c.minutes).toBe(30);
  });

  it("flags an instant that has passed", () => {
    expect(countdownTo("2026-09-01T00:00:00Z", NOW).past).toBe(true);
  });

  it("formats the largest two units only", () => {
    expect(formatCountdown({ days: 2, hours: 3, minutes: 4, seconds: 5, past: false })).toBe("2d 3h");
    expect(formatCountdown({ days: 0, hours: 3, minutes: 4, seconds: 5, past: false })).toBe("3h 4m");
    expect(formatCountdown({ days: 0, hours: 0, minutes: 4, seconds: 5, past: false })).toBe("4m 5s");
  });
});

describe("formatReleaseDate", () => {
  it("renders the TBA sentinel as words, never as a year 9999", () => {
    expect(formatReleaseDate(TBA_DATE)).toBe("Date TBA");
  });

  it("renders a real date", () => {
    expect(formatReleaseDate("2026-10-01")).toContain("2026");
  });
});

describe("confidenceBand", () => {
  it("maps scores to the same bands as the backend", () => {
    expect(confidenceBand(95)).toBe("locked");
    expect(confidenceBand(90)).toBe("locked");
    expect(confidenceBand(89)).toBe("likely");
    expect(confidenceBand(70)).toBe("likely");
    expect(confidenceBand(69)).toBe("soft");
    expect(confidenceBand(45)).toBe("soft");
    expect(confidenceBand(44)).toBe("rumour");
  });

  it("treats a zero score as undated rather than a very low chance", () => {
    expect(confidenceBand(0)).toBe("undated");
  });
});

describe("bestListing", () => {
  it("prefers a purchasable listing over a cheaper sold-out one", () => {
    const drop = makeDrop({
      where: [
        listing({ retailer: "A", status: "sold_out", price: 100 }),
        listing({ retailer: "B", status: "live", price: 200 }),
      ],
    });
    expect(bestListing(drop)?.retailer).toBe("B");
  });

  it("prefers the cheaper of two equally available listings", () => {
    const drop = makeDrop({
      where: [
        listing({ retailer: "A", status: "live", price: 200 }),
        listing({ retailer: "B", status: "live", price: 150 }),
      ],
    });
    expect(bestListing(drop)?.retailer).toBe("B");
  });

  it("returns undefined when there are no listings", () => {
    expect(bestListing(makeDrop())).toBeUndefined();
  });
});

describe("isLiveNow", () => {
  it("is true when any retailer is live", () => {
    expect(isLiveNow(makeDrop({ where: [listing({ status: "sold_out" }), listing({ status: "live" })] }))).toBe(true);
  });

  it("is false when none are", () => {
    expect(isLiveNow(makeDrop({ where: [listing({ status: "coming_soon" })] }))).toBe(false);
  });
});

describe("sectionDrops", () => {
  it("puts imminent drops in 'soon' and distant ones in 'scheduled'", () => {
    const { soon, scheduled } = sectionDrops(
      [
        makeDrop({ id: "near", release_date: "2026-09-12" }),
        makeDrop({ id: "far", release_date: "2026-12-01" }),
      ],
      NOW
    );
    expect(soon.map((d) => d.id)).toEqual(["near"]);
    expect(scheduled.map((d) => d.id)).toEqual(["far"]);
  });

  it("separates undated drops", () => {
    const { undated } = sectionDrops([makeDrop({ id: "tba", release_date: TBA_DATE })], NOW);
    expect(undated.map((d) => d.id)).toEqual(["tba"]);
  });

  it("drops released items that are no longer buyable anywhere", () => {
    const sections = sectionDrops([makeDrop({ id: "gone", release_date: "2026-08-01" })], NOW);
    expect([...sections.soon, ...sections.scheduled, ...sections.undated]).toHaveLength(0);
  });

  it("keeps a released item that is still live at retail", () => {
    const { soon } = sectionDrops(
      [makeDrop({ id: "still", release_date: "2026-08-01", where: [listing({ status: "live" })] })],
      NOW
    );
    expect(soon.map((d) => d.id)).toEqual(["still"]);
  });

  it("promotes a far-dated drop to 'soon' once it is live at retail", () => {
    const { soon, scheduled } = sectionDrops(
      [makeDrop({ id: "early", release_date: "2026-12-01", where: [listing({ status: "live" })] })],
      NOW
    );
    expect(soon.map((d) => d.id)).toEqual(["early"]);
    expect(scheduled).toHaveLength(0);
  });

  it("orders 'soon' with live drops first, then by date", () => {
    const { soon } = sectionDrops(
      [
        makeDrop({ id: "b", release_date: "2026-09-15" }),
        makeDrop({ id: "a", release_date: "2026-09-10" }),
        makeDrop({ id: "live", release_date: "2026-09-20", where: [listing({ status: "live" })] }),
      ],
      NOW
    );
    expect(soon.map((d) => d.id)).toEqual(["live", "a", "b"]);
  });

  it("orders undated drops by confidence", () => {
    const { undated } = sectionDrops(
      [
        makeDrop({ id: "low", release_date: TBA_DATE, confidence: { score: 10, label: "Rumour", signals: [] } }),
        makeDrop({ id: "high", release_date: TBA_DATE, confidence: { score: 60, label: "Soft", signals: [] } }),
      ],
      NOW
    );
    expect(undated.map((d) => d.id)).toEqual(["high", "low"]);
  });

  it("handles an empty feed", () => {
    expect(sectionDrops([], NOW)).toEqual({ soon: [], scheduled: [], undated: [] });
  });
});
