/**
 * tax.ts — sales tax by province, for a true landed cost.
 *
 * Sticker price is not what you pay. Tax on trading cards ranges from 5% in
 * Alberta to 15% in the Atlantic provinces, so the cheapest listing for someone
 * in Calgary is often not the cheapest for someone in Halifax — a 10-point
 * spread easily outweighs a few dollars of sticker difference.
 *
 * Rates are the general GST/HST/PST position for tangible goods as of
 * 2026-09-07. Trading cards carry no special exemption in any province, which
 * is why a single rate per province is sufficient here. Quebec's QST compounds
 * in practice at a rate very close to simple addition; the combined figure below
 * is the commonly published effective rate.
 *
 * Deliberately not modelled: cross-border duty. That maths is genuinely hard to
 * get right and a wrong answer costs someone real money, so US retailers are
 * flagged as foreign rather than given a fabricated landed cost.
 */

export type Province = {
  code: string;
  name: string;
  /** Combined sales tax as a fraction, e.g. 0.13 for Ontario. */
  rate: number;
};

export const PROVINCES: Province[] = [
  { code: "AB", name: "Alberta", rate: 0.05 },
  { code: "BC", name: "British Columbia", rate: 0.12 },
  { code: "MB", name: "Manitoba", rate: 0.12 },
  { code: "NB", name: "New Brunswick", rate: 0.15 },
  { code: "NL", name: "Newfoundland and Labrador", rate: 0.15 },
  { code: "NS", name: "Nova Scotia", rate: 0.14 },
  { code: "NT", name: "Northwest Territories", rate: 0.05 },
  { code: "NU", name: "Nunavut", rate: 0.05 },
  { code: "ON", name: "Ontario", rate: 0.13 },
  { code: "PE", name: "Prince Edward Island", rate: 0.15 },
  { code: "QC", name: "Quebec", rate: 0.14975 },
  { code: "SK", name: "Saskatchewan", rate: 0.11 },
  { code: "YT", name: "Yukon", rate: 0.05 },
];

export const DEFAULT_PROVINCE = "ON";

export function provinceRate(code: string | null | undefined): number | null {
  if (!code) return null;
  const found = PROVINCES.find((p) => p.code === code.toUpperCase());
  return found ? found.rate : null;
}

export function provinceName(code: string | null | undefined): string | null {
  if (!code) return null;
  return PROVINCES.find((p) => p.code === code.toUpperCase())?.name ?? null;
}

/**
 * Price with sales tax applied. Returns the input unchanged when no province is
 * selected — showing a made-up tax figure would be worse than showing none.
 */
export function withTax(price: number, provinceCode: string | null | undefined): number {
  const rate = provinceRate(provinceCode);
  if (rate === null) return price;
  return price * (1 + rate);
}

export function taxLabel(provinceCode: string | null | undefined): string | null {
  const rate = provinceRate(provinceCode);
  if (rate === null) return null;
  return `incl. ${(rate * 100).toFixed(rate === 0.14975 ? 3 : 0)}% tax`;
}
