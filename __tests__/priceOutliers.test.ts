import {
  IMPLAUSIBLE_FRACTION, MIN_LISTINGS_FOR_MEDIAN,
  implausibleFloor, isImplausiblyCheap, median,
} from "../lib/priceOutliers";

describe("median", () => {
  it("takes the middle of an odd-length list", () => {
    expect(median([10, 30, 20])).toBe(20);
  });

  it("averages the middle pair of an even-length list", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("ignores zero and negative prices", () => {
    expect(median([0, -5, 10, 20, 30])).toBe(20);
  });

  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
    expect(median([0])).toBeNull();
  });
});

describe("implausibleFloor", () => {
  it("is a tenth of the median", () => {
    expect(implausibleFloor([100, 200, 300])).toBeCloseTo(20);
  });

  it("refuses to judge a group with too few listings", () => {
    // With two listings the outlier and the normal price are the same claim.
    expect(implausibleFloor([6.99, 699])).toBeNull();
    expect(implausibleFloor([699])).toBeNull();
  });

  it(`needs ${MIN_LISTINGS_FOR_MEDIAN} priced listings, not just entries`, () => {
    expect(implausibleFloor([0, 0, 100, 200])).toBeNull();
  });
});

describe("isImplausiblyCheap", () => {
  const boxes = [599.99, 698.28, 729.95, 808.68];

  it("catches a pack priced as a box", () => {
    // The live case: EB Games listed a $6.99 item as a Paldea Evolved box.
    expect(isImplausiblyCheap(6.99, [...boxes, 6.99])).toBe(true);
  });

  it("leaves a genuine deep discount alone", () => {
    // Half off is a real clearance and must survive.
    expect(isImplausiblyCheap(300, [...boxes, 300])).toBe(false);
  });

  it("leaves even an 80% discount alone", () => {
    expect(isImplausiblyCheap(140, [...boxes, 140])).toBe(false);
  });

  it("fires just below the threshold and not just above", () => {
    const prices = [100, 100, 100];
    const floor = 100 * IMPLAUSIBLE_FRACTION;
    expect(isImplausiblyCheap(floor - 0.01, prices)).toBe(true);
    expect(isImplausiblyCheap(floor, prices)).toBe(false);
  });

  it("never fires when the group is too small to judge", () => {
    expect(isImplausiblyCheap(6.99, [6.99, 699])).toBe(false);
  });

  it("does not fire on a group whose prices genuinely vary a little", () => {
    expect(isImplausiblyCheap(90, [90, 100, 110])).toBe(false);
  });
});

describe("median dilution", () => {
  it("a duplicated outlier can hide itself", () => {
    // Why the fix matters: counting the suspect listing twice pulls the median
    // toward it, and it stops looking like an outlier.
    const honest = [92.46, 949.95, 1025.34];
    const doubled = [92.46, 92.46, 949.95, 1025.34];
    expect(isImplausiblyCheap(92.46, honest)).toBe(true);
    expect(isImplausiblyCheap(92.46, doubled)).toBe(false);
  });

  it("catches a group where two listings are bad", () => {
    // Mega Evolution Chaos Rising: two pack prices, two real box prices.
    const prices = [8.95, 8.99, 241.86, 324.99];
    expect(isImplausiblyCheap(8.95, prices)).toBe(true);
    expect(isImplausiblyCheap(241.86, prices)).toBe(false);
  });
});
