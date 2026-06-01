import { format, subDays } from "date-fns";

export type RangeParam = "7d" | "30d" | "90d" | "mtd";

/** Resolve a ?range= param to a [from, to] yyyy-MM-dd window (default 30d). */
export function resolveRange(range?: string): {
  from: string;
  to: string;
  range: RangeParam;
} {
  const now = new Date();
  const to = format(now, "yyyy-MM-dd");
  switch (range) {
    case "7d":
      return { from: format(subDays(now, 7), "yyyy-MM-dd"), to, range: "7d" };
    case "90d":
      return { from: format(subDays(now, 90), "yyyy-MM-dd"), to, range: "90d" };
    case "mtd":
      return {
        from: format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"),
        to,
        range: "mtd",
      };
    default:
      return { from: format(subDays(now, 30), "yyyy-MM-dd"), to, range: "30d" };
  }
}
