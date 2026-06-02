/**
 * Functional test for outcome-metric ingestion (Phase 12.1, architecture §7).
 * Run: npx dotenv -e .env.local -- tsx scripts/test-outcomes.ts
 *
 * Covers the acceptance criteria:
 *  - A metric can be defined and values loaded (manual path here; CSV uses the
 *    same upsert; API path exercised via the route handler below).
 *  - Values bind to the right grain + period.
 *  - The API endpoint validates and is org-scoped.
 *  - RLS policies exist on the new tables.
 */
import { db } from "@/lib/db/client";
import { withOrgContext } from "@/lib/db/rls";
import {
  organizations,
  outcomeMetrics,
  outcomeValues,
  ingestTokens,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { parseScaledValue, formatScaledValue, upsertOutcomeValues } from "@/lib/outcomes/ingest";
import { generateIngestToken } from "@/lib/tokens/ingest-token";
import { POST as ingestPost } from "@/app/api/ingest/outcomes/route";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  // ── 1. Pure value scaling (no float drift) ──────────────────────────────────
  console.log("Value scaling (×1e6, exact):");
  check('"1200.50" → 1_200_500_000', parseScaledValue("1200.50") === 1_200_500_000n);
  check('"9800" tickets → 9_800_000_000', parseScaledValue("9800") === 9_800_000_000n);
  check('thousands commas "1,234.56"', parseScaledValue("1,234.56") === 1_234_560_000n);
  check('negative "-0.000001"', parseScaledValue("-0.000001") === -1n);
  check("round-trips through format", formatScaledValue(1_200_500_000n) === "1200.5");
  let threw = false;
  try { parseScaledValue("12.3.4"); } catch { threw = true; }
  check("rejects malformed input", threw);
  threw = false;
  try { parseScaledValue("1.1234567"); } catch { threw = true; }
  check("rejects >6 decimal places", threw);

  // Need a real org for the DB-backed checks.
  const [org] = await db.select({ id: organizations.id }).from(organizations).limit(1);
  if (!org) { console.error("No org in DB — cannot run DB checks."); process.exit(failures === 0 ? 0 : 1); }
  const orgId = org.id;
  const KEY = "__test_revenue__";

  // Clean any prior residue first (FK-safe order).
  await db.delete(outcomeValues).where(and(eq(outcomeValues.orgId, orgId), sql`metric_id in (select id from outcome_metrics where key = ${KEY})`));
  await db.delete(outcomeMetrics).where(and(eq(outcomeMetrics.orgId, orgId), eq(outcomeMetrics.key, KEY)));

  // ── 2. Define a metric + load a value, then re-load same period (idempotent) ──
  console.log("\nMetric + values (idempotent upsert):");
  const metricId = await withOrgContext(orgId, async (tx) => {
    const [m] = await tx
      .insert(outcomeMetrics)
      .values({ orgId, key: KEY, name: "Test revenue", unit: "usd_revenue", grain: "customer", direction: "higher_is_better" })
      .returning({ id: outcomeMetrics.id });
    return m.id;
  });
  check("metric defined", !!metricId);

  await withOrgContext(orgId, (tx) =>
    upsertOutcomeValues(tx, orgId, [
      { metricId, grainRef: "acme", periodStart: "2026-05-01", periodEnd: "2026-05-31", value: parseScaledValue("5000"), source: "manual" },
    ])
  );
  await withOrgContext(orgId, (tx) =>
    upsertOutcomeValues(tx, orgId, [
      { metricId, grainRef: "acme", periodStart: "2026-05-01", periodEnd: "2026-05-31", value: parseScaledValue("5200"), source: "csv" },
    ])
  );
  const rows = await withOrgContext(orgId, (tx) =>
    tx.select().from(outcomeValues).where(eq(outcomeValues.metricId, metricId))
  );
  check("same (grain,period) overwrites — exactly 1 row", rows.length === 1, `got ${rows.length}`);
  check("value updated to last write (5200)", rows[0]?.value === 5_200_000_000n, `${rows[0]?.value}`);
  check("bound to the right grain ref + period", rows[0]?.grainRef === "acme" && rows[0]?.periodStart === "2026-05-01");
  check("source reflects last write (csv)", rows[0]?.source === "csv");

  // ── 3. API endpoint: org-scoped + validates ─────────────────────────────────
  console.log("\nAPI endpoint (/api/ingest/outcomes):");
  const { plaintext, tokenHash, tokenPrefix } = generateIngestToken();
  await withOrgContext(orgId, (tx) =>
    tx.insert(ingestTokens).values({ orgId, name: "__test_token__", tokenHash, tokenPrefix, scope: "outcomes" })
  );
  const url = "http://localhost/api/ingest/outcomes";
  const body = (v: unknown) => JSON.stringify(v);

  const noAuth = await ingestPost(new Request(url, { method: "POST", body: body({ values: [] }) }));
  check("401 without a token", noAuth.status === 401);

  const badMetric = await ingestPost(new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${plaintext}` },
    body: body({ values: [{ metricKey: "__nope__", grainRef: "x", periodStart: "2026-05-01", periodEnd: "2026-05-31", value: 1 }] }),
  }));
  check("422 on unknown metric key", badMetric.status === 422);

  const ok = await ingestPost(new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${plaintext}` },
    body: body({ values: [{ metricKey: KEY, grainRef: "globex", periodStart: "2026-05-01", periodEnd: "2026-05-31", value: "7500.25" }] }),
  }));
  const okJson = await ok.json();
  check("200 + accepted=1 on valid push", ok.status === 200 && okJson.accepted === 1, JSON.stringify(okJson));
  const apiRow = await withOrgContext(orgId, (tx) =>
    tx.select().from(outcomeValues).where(and(eq(outcomeValues.metricId, metricId), eq(outcomeValues.grainRef, "globex")))
  );
  check("API value stored scaled (7500.25 → 7_500_250_000)", apiRow[0]?.value === 7_500_250_000n, `${apiRow[0]?.value}`);
  check("API value tagged source=api", apiRow[0]?.source === "api");

  // grain mismatch: org-grain metric rejects a grainRef
  const grainMismatch = await ingestPost(new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${plaintext}` },
    body: body({ values: [{ metricKey: KEY, periodStart: "2026-05-01", periodEnd: "2026-05-31", value: 1 }] }),
  }));
  check("422 when customer-grain metric is missing grainRef", grainMismatch.status === 422);

  // ── 4. RLS policies exist ────────────────────────────────────────────────────
  console.log("\nRLS:");
  const pol = await db.execute(sql`
    select tablename from pg_policies
    where policyname = 'tenant_isolation'
      and tablename in ('outcome_metrics','outcome_values','ingest_tokens')
  `);
  const tables = new Set((pol as unknown as { tablename: string }[]).map((r) => r.tablename));
  check("outcome_metrics has tenant_isolation policy", tables.has("outcome_metrics"));
  check("outcome_values has tenant_isolation policy", tables.has("outcome_values"));
  check("ingest_tokens has tenant_isolation policy", tables.has("ingest_tokens"));

  // ── Cleanup (FK-safe) ────────────────────────────────────────────────────────
  await db.delete(outcomeValues).where(eq(outcomeValues.metricId, metricId));
  await db.delete(outcomeMetrics).where(eq(outcomeMetrics.id, metricId));
  await db.delete(ingestTokens).where(eq(ingestTokens.tokenHash, tokenHash));

  console.log(failures === 0 ? "\n✅ all checks passed" : `\n❌ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
