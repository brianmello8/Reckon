/**
 * Stripe price IDs (from env, per-environment test/live) + billing constants.
 *
 * Pricing model (set the IDs in .env / Stripe):
 *  - Pro: per-seat (1 seat = 1 tracked developer), buyer-chosen quantity.
 *  - Pro Finance: Pro + a FLAT monthly/annual add-on that unlocks the finance
 *    surface (org-wide, not per-seat).
 */

export const STRIPE_PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";
export const STRIPE_PRICE_PRO_ANNUAL = process.env.STRIPE_PRICE_PRO_ANNUAL ?? "";
export const STRIPE_PRICE_FINANCE_MONTHLY = process.env.STRIPE_PRICE_FINANCE_MONTHLY ?? "";
export const STRIPE_PRICE_FINANCE_ANNUAL = process.env.STRIPE_PRICE_FINANCE_ANNUAL ?? "";

/** Minimum purchased seats on a paid plan (no artificial price floor above this). */
export const MIN_SEATS = 3;

export function proPrice(interval: "month" | "year"): string {
  return interval === "year" ? STRIPE_PRICE_PRO_ANNUAL : STRIPE_PRICE_PRO_MONTHLY;
}
export function financePrice(interval: "month" | "year"): string {
  return interval === "year" ? STRIPE_PRICE_FINANCE_ANNUAL : STRIPE_PRICE_FINANCE_MONTHLY;
}

/** All Pro per-seat price IDs (used by the webhook to find the seat line item). */
export function proPriceIds(): string[] {
  return [STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL].filter(Boolean);
}
/** All finance add-on price IDs (used by the webhook to detect the add-on). */
export function financePriceIds(): string[] {
  return [STRIPE_PRICE_FINANCE_MONTHLY, STRIPE_PRICE_FINANCE_ANNUAL].filter(Boolean);
}
