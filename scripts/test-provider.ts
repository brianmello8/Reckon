import { subDays } from "date-fns";
import { getProviderClient } from "../lib/providers/registry";
import { keyFingerprint } from "../lib/encryption/envelope";

async function main() {
  const [, , providerKey, apiKey] = process.argv;

  if (!providerKey || !apiKey) {
    console.error("Usage: tsx scripts/test-provider.ts <provider> <api-key>");
    console.error("  provider: anthropic | openai | github_copilot");
    console.error("  api-key: your provider API key");
    console.error("");
    console.error("  For github_copilot, use format: org_name:token");
    process.exit(1);
  }

  const client = getProviderClient(providerKey);
  const since = subDays(new Date(), 7);
  const until = new Date();

  console.log(`\nProvider: ${providerKey}`);
  console.log(`Key: ...${keyFingerprint(apiKey)}`);
  console.log(`Range: ${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`);
  console.log(`\nFetching...\n`);

  const rows = await client.fetchUsage({ apiKey, since, until });

  if (rows.length === 0) {
    console.log("No usage data returned.");
    return;
  }

  // Summary
  let totalCostMicros = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const row of rows) {
    totalCostMicros += row.cost_usd_micros;
    totalInputTokens += row.input_tokens;
    totalOutputTokens += row.output_tokens;
  }

  console.log(`Total rows: ${rows.length}`);
  console.log(`Total cost: $${(totalCostMicros / 1_000_000).toFixed(2)}`);
  console.log(`Total input tokens: ${totalInputTokens.toLocaleString()}`);
  console.log(`Total output tokens: ${totalOutputTokens.toLocaleString()}`);
  console.log(`\nDaily breakdown:\n`);

  // Group by date
  const byDate = new Map<string, { cost: number; models: Set<string> }>();
  for (const row of rows) {
    const existing = byDate.get(row.time_bucket);
    if (existing) {
      existing.cost += row.cost_usd_micros;
      existing.models.add(row.model);
    } else {
      byDate.set(row.time_bucket, {
        cost: row.cost_usd_micros,
        models: new Set([row.model]),
      });
    }
  }

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [date, { cost, models }] of sorted) {
    console.log(
      `  ${date}  $${(cost / 1_000_000).toFixed(2).padStart(8)}  models: ${Array.from(models).join(", ")}`
    );
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
