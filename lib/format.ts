/**
 * Formats a cost in USD micros to a display string.
 * $1.00 = 1_000_000 micros.
 *
 * formatCost(1_234_560n) → "$1.23"
 * formatCost(0n)         → "$0.00"
 */
export function formatCost(micros: bigint | number): string {
  const value = Number(micros) / 1_000_000;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
