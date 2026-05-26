import { format, subDays } from "date-fns";
import {
  getDailyTotalsForOrg,
  getDeveloperRanking,
} from "../lib/queries/usage";
import { formatCost } from "../lib/format";

async function main() {
  const [, , orgId, fromArg, toArg] = process.argv;

  if (!orgId) {
    console.error("Usage: tsx scripts/usage-report.ts <org_id> [from] [to]");
    console.error("  from/to: YYYY-MM-DD (defaults to last 30 days)");
    process.exit(1);
  }

  const to = toArg ?? format(new Date(), "yyyy-MM-dd");
  const from = fromArg ?? format(subDays(new Date(), 30), "yyyy-MM-dd");

  console.log(`\nUsage Report for org ${orgId}`);
  console.log(`Period: ${from} → ${to}\n`);

  // Daily totals
  console.log("=== Daily Totals ===\n");
  const dailyTotals = await getDailyTotalsForOrg(orgId, from, to);

  if (dailyTotals.length === 0) {
    console.log("  No usage data found.\n");
  } else {
    let grandTotal = 0n;
    for (const day of dailyTotals) {
      const cost = BigInt(day.totalCostUsdMicros ?? 0);
      grandTotal += cost;
      console.log(`  ${day.date}  ${formatCost(cost).padStart(10)}`);
    }
    console.log(`  ${"─".repeat(24)}`);
    console.log(`  Total:     ${formatCost(grandTotal).padStart(10)}\n`);
  }

  // Developer ranking
  console.log("=== Developer Ranking ===\n");
  const ranking = await getDeveloperRanking(orgId, from, to);

  if (ranking.length === 0) {
    console.log("  No developer data found.\n");
  } else {
    console.log(
      "  " +
        "Developer".padEnd(25) +
        "Total".padStart(10) +
        "% of Org".padStart(10) +
        "vs 7d Avg".padStart(12)
    );
    console.log("  " + "─".repeat(57));
    for (const dev of ranking) {
      const delta =
        dev.vsTrailing7dAvgPct > 0
          ? `+${dev.vsTrailing7dAvgPct.toFixed(0)}%`
          : `${dev.vsTrailing7dAvgPct.toFixed(0)}%`;
      console.log(
        "  " +
          dev.name.padEnd(25) +
          formatCost(dev.totalCost).padStart(10) +
          `${dev.pctOfOrg.toFixed(1)}%`.padStart(10) +
          delta.padStart(12)
      );
    }
  }

  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
