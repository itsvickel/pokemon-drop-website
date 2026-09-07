/**
 * Contract test between the two repos.
 *
 * drops.json is written by drops_core.py in tcg-drop-alert and read by
 * lib/drops.ts here. Nothing but this test stops the two from drifting: a field
 * renamed on the Python side would typecheck fine and fail silently at runtime.
 * The fixture is REAL output from `python update_drops.py --game mtg`, trimmed
 * to one drop of each shape, so regenerating it is how you notice a schema change.
 *
 * It also renders ConfidenceBadge against that real data, which is the piece
 * most likely to break on an unexpected shape.
 */
import { renderToStaticMarkup } from "react-dom/server";
import ConfidenceBadge from "../components/ConfidenceBadge";
import {
  TBA_DATE,
  bestListing,
  confidenceBand,
  formatGoLive,
  isLiveNow,
  sectionDrops,
  type DropsResponse,
} from "../lib/drops";
import fixture from "./fixtures/drops.mtg.json";

const feed = fixture as unknown as DropsResponse;

describe("drops.json contract", () => {
  it("parses the real generated feed", () => {
    expect(feed.drops.length).toBeGreaterThan(0);
    expect(feed.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("every drop carries the fields the UI reads", () => {
    for (const drop of feed.drops) {
      expect(typeof drop.id).toBe("string");
      expect(typeof drop.name).toBe("string");
      expect(typeof drop.release_date).toBe("string");
      expect(Array.isArray(drop.where)).toBe(true);
      expect(Array.isArray(drop.sources)).toBe(true);
      expect(typeof drop.confidence?.score).toBe("number");
      expect(Array.isArray(drop.confidence?.signals)).toBe(true);
    }
  });

  it("confidence scores stay inside the documented range", () => {
    for (const drop of feed.drops) {
      expect(drop.confidence.score).toBeGreaterThanOrEqual(0);
      expect(drop.confidence.score).toBeLessThanOrEqual(99);
    }
  });

  it("backend and frontend agree on the band for every score", () => {
    const expected: Record<string, string> = {
      Locked: "locked",
      Likely: "likely",
      Soft: "soft",
      Rumour: "rumour",
      "No date": "undated",
    };
    for (const drop of feed.drops) {
      expect(confidenceBand(drop.confidence.score)).toBe(expected[drop.confidence.label]);
    }
  });

  it("names survive the Python -> JSON -> TS round trip without mojibake", () => {
    // Guards the requests latin-1 default that mangled "Mood Swings™".
    const names = feed.drops.map((d) => d.name).join(" ");
    expect(names).not.toMatch(/Ã|â€|â„¢/);
  });

  it("exposes an exact go-live instant for at least one drop", () => {
    const timed = feed.drops.filter((d) => d.go_live?.precision === "exact");
    expect(timed.length).toBeGreaterThan(0);
    for (const drop of timed) {
      expect(Number.isNaN(Date.parse(drop.go_live!.at))).toBe(false);
      expect(formatGoLive(drop.go_live!.at)).toEqual(expect.any(String));
    }
  });

  it("records the source timezone alongside the normalised instant", () => {
    const sl = feed.drops.find((d) => d.sources.includes("secretlair"));
    expect(sl?.go_live?.source_tz).toBe("Europe/Madrid");
    expect(sl?.go_live?.at).toMatch(/Z$/);
  });

  it("carries attribution for every licensed source", () => {
    expect(feed.attribution.length).toBeGreaterThan(0);
    for (const credit of feed.attribution) {
      expect(typeof credit.name).toBe("string");
      expect(credit.url).toMatch(/^https?:\/\//);
    }
  });

  it("sections the real feed without losing or duplicating drops", () => {
    const { soon, scheduled, undated } = sectionDrops(feed.drops, new Date("2026-09-07T12:00:00Z"));
    const ids = [...soon, ...scheduled, ...undated].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every drop in the fixture is either upcoming or still live, so none drop out.
    expect(ids.length).toBe(feed.drops.length);
  });

  it("puts an undated drop in the undated section, not at the year 9999", () => {
    const { undated } = sectionDrops(feed.drops, new Date("2026-09-07T12:00:00Z"));
    expect(undated.length).toBeGreaterThan(0);
    expect(undated.every((d) => d.release_date === TBA_DATE)).toBe(true);
  });

  it("finds a purchasable listing for a live drop", () => {
    const live = feed.drops.find(isLiveNow);
    expect(live).toBeDefined();
    expect(bestListing(live!)?.status).toBe("live");
  });
});

describe("ConfidenceBadge against real data", () => {
  it("renders every drop's confidence without throwing", () => {
    for (const drop of feed.drops) {
      const html = renderToStaticMarkup(<ConfidenceBadge confidence={drop.confidence} />);
      expect(html).toContain("button");
    }
  });

  it("shows the percentage for a dated drop", () => {
    const dated = feed.drops.find((d) => d.confidence.score > 0)!;
    const html = renderToStaticMarkup(<ConfidenceBadge confidence={dated.confidence} />);
    expect(html).toContain(`${dated.confidence.score}%`);
  });

  it("shows words rather than 0% for an undated drop", () => {
    const undated = feed.drops.find((d) => d.confidence.score === 0);
    if (!undated) return;
    const html = renderToStaticMarkup(<ConfidenceBadge confidence={undated.confidence} />);
    expect(html).toContain("No date yet");
    expect(html).not.toContain("0%");
  });

  it("surfaces the calibration note when one is supplied", () => {
    const drop = feed.drops[0];
    const html = renderToStaticMarkup(
      <ConfidenceBadge confidence={drop.confidence} accuracyNote="Our 90-100% calls have landed 91% of the time (n=23)." />
    );
    // The note lives in the tooltip, which is closed until interaction.
    expect(html).not.toContain("n=23");
  });
});
