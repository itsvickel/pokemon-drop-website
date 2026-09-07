/**
 * siteFacts.ts — claims the site makes about itself, in one place.
 *
 * These were previously hardcoded across meta descriptions and badges, and had
 * drifted away from what the data actually supports:
 *
 *   "50+ Canadian retailers"  -> measured 21 unique across both games
 *   "Updated every 3 hours"   -> the trackers run every 12 hours
 *   "All-time low"            -> history is capped at 90 days, median 35
 *
 * On a price-comparison site, trust is the product: someone who catches one
 * overstatement stops believing the prices too. Keeping the claims here means a
 * change to the crawler cadence or retailer list has exactly one place to
 * update, and reviewers can see the claim and its justification together.
 */

/**
 * Deliberately conservative. Measured 2026-09-07: 14 retailers carry Magic,
 * 15 carry Pokemon, 21 unique across both. Stated as a floor so normal churn in
 * the retailer mix can never make the copy false.
 */
export const RETAILER_CLAIM = "20+";

/**
 * The trackers in the tcg-drop-alert repo run on a twelve-hourly cron, so the
 * site sees two refreshes a day. Kept as prose because it appears mid-sentence
 * in meta descriptions.
 *
 * (Deliberately not writing the cron expression here: it contains a star-slash
 * sequence that would close this comment block.)
 */
export const UPDATE_CADENCE = "twice daily";

/**
 * How far back price history actually reaches. The crawler retains 90 days, so
 * a "low" is a low within that window — never an all-time one.
 */
export const PRICE_WINDOW_DAYS = 90;

/** Label for the lowest price seen. Replaces "all-time low" everywhere. */
export const LOW_LABEL = `${PRICE_WINDOW_DAYS}-day low`;
export const LOW_LABEL_TITLE = `${PRICE_WINDOW_DAYS}-Day Low`;
export const HIGH_LABEL_TITLE = `${PRICE_WINDOW_DAYS}-Day High`;

/**
 * Below this much tracked history, a "low" says more about when we started
 * watching than about the price. A quarter of products have under a week, so
 * their low would otherwise be a six-day low wearing a 90-day label.
 */
export const LOW_BADGE_MIN_DAYS = 14;
