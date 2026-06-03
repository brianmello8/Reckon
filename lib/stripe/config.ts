/**
 * Stripe price IDs (from env, per-environment test/live) + billing constants.
 *
 * Pricing model (set the IDs in .env / Stripe):
 *  - Pro: per-seat (1 seat = 1 tracked developer), buyer-chosen quantity.
 *  - Pro Finance: Pro + a FLAT monthly/annual add-on that unlocks the finance
 *    surface (org-wide, not per-seat).
 */

export const STRIPE_PRICE_ENTRY_MONTHLY = process.env.STRIPE_PRICE_ENTRY_MONTHLY ?? "";
export const STRIPE_PRICE_ENTRY_ANNUAL = process.env.STRIPE_PRICE_ENTRY_ANNUAL ?? "";
export const STRIPE_PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";
export const STRIPE_PRICE_PRO_ANNUAL = process.env.STRIPE_PRICE_PRO_ANNUAL ?? "";
export const STRIPE_PRICE_FINANCE_MONTHLY = process.env.STRIPE_PRICE_FINANCE_MONTHLY ?? "";
export const STRIPE_PRICE_FINANCE_ANNUAL = process.env.STRIPE_PRICE_FINANCE_ANNUAL ?? "";

/** Minimum purchased seats on Pro (no artificial price floor above this). */
export const MIN_SEATS = 3;

export function entryPrice(interval: "month" | "year"): string {
  return interval === "year" ? STRIPE_PRICE_ENTRY_ANNUAL : STRIPE_PRICE_ENTRY_MONTHLY;
}
export function proPrice(interval: "month" | "year"): string {
  return interval === "year" ? STRIPE_PRICE_PRO_ANNUAL : STRIPE_PRICE_PRO_MONTHLY;
}
export function financePrice(interval: "month" | "year"): string {
  return interval === "year" ? STRIPE_PRICE_FINANCE_ANNUAL : STRIPE_PRICE_FINANCE_MONTHLY;
}

/** Entry (flat) price IDs — webhook maps these to plan = "entry". */
export function entryPriceIds(): string[] {
  return [STRIPE_PRICE_ENTRY_MONTHLY, STRIPE_PRICE_ENTRY_ANNUAL].filter(Boolean);
}
/** Pro per-seat price IDs — webhook maps these to plan = "pro" + seat count. */
export function proPriceIds(): string[] {
  return [STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL].filter(Boolean);
}
/** Finance add-on price IDs (detect the add-on). */
export function financePriceIds(): string[] {
  return [STRIPE_PRICE_FINANCE_MONTHLY, STRIPE_PRICE_FINANCE_ANNUAL].filter(Boolean);
}
