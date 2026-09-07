const EXPLICIT_RE  = /(\d+)\s*[-–]?\s*(?:booster\s*)?packs?/i;
const EXPLICIT2_RE = /(\d+)\s*[-–]?\s*boosters?\b/i;

const KNOWN: Array<[RegExp, number]> = [
  [/booster\s*box|\bbbox\b/i,                           36],
  [/elite\s*trainer\s*box|\betb\b/i,                     9],
  [/build\s*[&+]\s*battle/i,                             4],
  [/mini\s*tin/i,                                        2],
  [/checklane|blister/i,                                 3],
  [/booster\s*bundle/i,                                  3],
  [/half\s*(?:booster\s*)?box/i,                        18],
];

/**
 * A set year sitting next to the word "Booster" reads as a booster count:
 * "Modern Masters 2017 - Booster Pack" matched as 2017 packs, which then made
 * price-per-pack come out at a cent. No sealed product contains a four-figure
 * number of boosters, so implausible counts are rejected outright.
 */
const MAX_PLAUSIBLE_PACKS = 400; // a sealed case tops out well below this

function plausible(n: number): boolean {
  if (n <= 1 || n > MAX_PLAUSIBLE_PACKS) return false;
  if (n >= 1900 && n <= 2099) return false; // a year, not a quantity
  return true;
}

export function computePackCount(name: string): number | null {
  let m = EXPLICIT_RE.exec(name) ?? EXPLICIT2_RE.exec(name);
  if (m) {
    const n = parseInt(m[1], 10);
    if (plausible(n)) return n;
  }
  for (const [re, count] of KNOWN) {
    if (re.test(name)) return count;
  }
  return null;
}
