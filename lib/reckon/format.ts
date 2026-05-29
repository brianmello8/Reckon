/** Display formatters — money in tabular mono, percentages, initials. */

export function fmtMoney(v: number, dp = 2): string {
  return (
    "$" +
    Number(v).toLocaleString("en-US", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    })
  );
}

/** Compact money for axis labels: $1.2k, $42, $0.30 */
export function fmtCompact(v: number): string {
  if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
  if (v >= 1) return "$" + v.toFixed(0);
  return "$" + v.toFixed(2);
}

/** Signed percentage: +12.0% / -8.3% (input is a ratio, e.g. 0.12) */
export function fmtPct(v: number, dp = 1): string {
  return (v > 0 ? "+" : "") + (v * 100).toFixed(dp) + "%";
}

/** micros (bigint or number) → dollars number */
export function microsToDollars(micros: bigint | number | string): number {
  return Number(micros) / 1_000_000;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4": "Opus 4",
  "claude-sonnet-4": "Sonnet 4",
  "claude-haiku-4": "Haiku 4",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5 mini",
  o4: "o4",
  "copilot-business": "Copilot Business",
};

export function modelLabel(m: string): string {
  return MODEL_LABELS[m] ?? m;
}
