/**
 * Functional test for unit economics & margin (Phase 12.2, architecture §5h).
 * Run: npx dotenv -e .env.local -- tsx scripts/test-unit-economics.ts
 *
 * Acceptance criteria covered:
 *  - Cost-per-unit computes correctly at customer, product_line, and workflow grain.
 *  - AI COGS % of revenue uses ONLY COGS-coded spend.
 *  - A margin alert fires when a seeded customer's cost exceeds its revenue.
 *  - Missing outcome data shows honestly, never a fabricated ratio.
 *  - Every cost figure reconciles to underlying usage totals.
 *
 * Seeds an isolated window (2020-01) for an existing org, reusing a real
 * provider key, then cleans up in FK-safe order.
 */
import { db } from "@/lib/db/client";
import {
  usageEvents, usageAttribution, costAllocations, glAccounts, productLines,
  workflows, workflowRuns, agents, attributionSources, outcomeMetrics, outcomeValues,
  organizations, providers, providerKeys,
} from "@/lib/db/schema";
import { and, eq, between, like, inArray } from "drizzle-orm";
import {
  costPerUnitMicros, ratioBps, isRevenueUnit, getUnitEconomics,
} from "@/lib/unit-economics/compute";
import { evaluateMargin, detectMarginAlerts } from "@/lib/unit-economics/margin-alerts";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const FROM = "2020-01-01", TO = "2020-01-31";
const M = 1_000_000n;

async function main() {
  // ── Pure helpers ─────────────────────────────────────────────────────────────
  console.log("Pure formulas:");
  check("$4200 / 9800 tickets = $0.4285/unit (428571 micros)", costPerUnitMicros(4200n * M, 9_800n * M) === 428571n);
  check("no outcome → null cost-per-unit (never fabricated)", costPerUnitMicros(4200n * M, 0n) === null);
  check("COGS $1000 / revenue $5000 = 2000 bps (20%)", ratioBps(1000n * M, 5000n * M) === 2000);
  check("ratio with no denom → null", ratioBps(1000n * M, 0n) === null);
  check("usd_revenue is a revenue unit", isRevenueUnit("usd_revenue") && isRevenueUnit("mrr"));
  check("tickets_closed is not a revenue unit", !isRevenueUnit("tickets_closed"));
  check("margin: cost>revenue → negative_margin (at risk = overage)", (() => {
    const v = evaluateMargin(4200n * M, 4000n * M); return v.kind === "negative_margin" && v.marginAtRiskMicros === 200n * M;
  })());
  check("margin: cost under threshold → no alert", evaluateMargin(100n * M, 5000n * M).kind === null);
  check("margin: no revenue → no alert", evaluateMargin(100n * M, 0n).kind === null);

  // ── Seed an isolated window ──────────────────────────────────────────────────
  const [org] = await db.select({ id: organizations.id }).from(organizations).limit(1);
  const [prov] = await db.select({ id: providers.id }).from(providers).limit(1);
  if (!org || !prov) { console.error("Need at least one org + provider; skipping DB checks."); process.exit(failures === 0 ? 0 : 1); }
  const orgId = org.id;
  const providerId = prov.id;

  // Clean any prior residue for this window first.
  await cleanup(orgId);

  // Temp provider key to anchor usage_events (dummy ciphertext — never decrypted).
  const dummy = Buffer.from([0]);
  const [pk] = await db.insert(providerKeys).values({
    orgId, providerId, encryptedKey: dummy, encryptedDek: dummy, iv: dummy, authTag: dummy, keyFingerprint: "__ue_key__",
  }).returning({ id: providerKeys.id });
  const providerKeyId = pk.id;

  const ids = await db.transaction(async (tx) => {
    const [cogsGl] = await tx.insert(glAccounts).values({ orgId, code: "__ue_cogs__", name: "Test COGS", accountType: "cogs" }).returning({ id: glAccounts.id });
    const [opexGl] = await tx.insert(glAccounts).values({ orgId, code: "__ue_opex__", name: "Test Opex", accountType: "opex_rnd" }).returning({ id: glAccounts.id });
    const [pl] = await tx.insert(productLines).values({ orgId, code: "__ue_pl__", name: "Test PL" }).returning({ id: productLines.id });
    const [agent] = await tx.insert(agents).values({ orgId, name: "__ue_agent__" }).returning({ id: agents.id });
    const [wf1] = await tx.insert(workflows).values({ orgId, agentId: agent.id, name: "__ue_wf1__" }).returning({ id: workflows.id });
    const [wf2] = await tx.insert(workflows).values({ orgId, agentId: agent.id, name: "__ue_wf2__" }).returning({ id: workflows.id });
    const [run] = await tx.insert(workflowRuns).values({ orgId, workflowId: wf1.id, customerRef: "__ue_cust__", startedAt: new Date("2020-01-15T12:00:00Z"), status: "completed" }).returning({ id: workflowRuns.id });
    const [src] = await tx.insert(attributionSources).values({ orgId, sourceType: "key_mapping", label: "__ue_src__" }).returning({ id: attributionSources.id });

    // Events: A $4200 (COGS, PL, → wf1+customer), B $1000 (opex, PL, no attribution), C $500 (uncoded, → wf2 no customer)
    const mkEvent = async (ident: string, model: string, micros: bigint) => {
      const [e] = await tx.insert(usageEvents).values({
        orgId, providerKeyId, providerId, externalIdentity: ident, timeBucket: "2020-01-10", model, costUsdMicros: micros,
      }).returning({ id: usageEvents.id });
      return e.id;
    };
    const a = await mkEvent("__ue_i_a__", "__ue_m_a__", 4200n * M);
    const b = await mkEvent("__ue_i_b__", "__ue_m_b__", 1000n * M);
    const c = await mkEvent("__ue_i_c__", "__ue_m_c__", 500n * M);

    await tx.insert(usageAttribution).values([
      { orgId, usageEventId: a, workflowId: wf1.id, workflowRunId: run.id, customerRef: "__ue_cust__", attributionSourceId: src.id, confidence: "exact" },
      { orgId, usageEventId: c, workflowId: wf2.id, attributionSourceId: src.id, confidence: "exact" },
    ]);
    await tx.insert(costAllocations).values([
      { orgId, usageEventId: a, glAccountId: cogsGl.id, productLineId: pl.id, codingStatus: "coded", allocationPct: 10000 },
      { orgId, usageEventId: b, glAccountId: opexGl.id, productLineId: pl.id, codingStatus: "coded", allocationPct: 10000 },
    ]);

    // Outcomes (values stored ×1e6). Window inside [FROM,TO].
    const mkMetric = async (key: string, unit: string, grain: "customer" | "product_line" | "workflow" | "org") => {
      const [m] = await tx.insert(outcomeMetrics).values({ orgId, key, name: key, unit, grain, direction: "higher_is_better" }).returning({ id: outcomeMetrics.id });
      return m.id;
    };
    const tickets = await mkMetric("__ue_tickets__", "tickets_closed", "workflow");
    const custRev = await mkMetric("__ue_cust_rev__", "usd_revenue", "customer");
    const plDocs = await mkMetric("__ue_docs__", "docs_processed", "product_line");
    const plRev = await mkMetric("__ue_pl_rev__", "usd_revenue", "product_line");
    const orgRev = await mkMetric("__ue_org_rev__", "usd_revenue", "org");
    const mkVal = (metricId: string, grainRef: string, value: bigint) =>
      ({ orgId, metricId, grainRef, periodStart: "2020-01-01", periodEnd: "2020-01-31", value, source: "manual" as const });
    await tx.insert(outcomeValues).values([
      mkVal(tickets, wf1.id, 9_800n * M),     // 9800 tickets
      mkVal(custRev, "__ue_cust__", 4_000n * M), // $4000 revenue (< $4200 cost → alert)
      mkVal(plDocs, pl.id, 2_600n * M),        // 2600 docs
      mkVal(plRev, pl.id, 10_000n * M),        // $10000 PL revenue
      mkVal(orgRev, "", 10_000n * M),          // $10000 org revenue
    ]);
    return { wf1: wf1.id, wf2: wf2.id, pl: pl.id };
  });

  // ── Run computations ──────────────────────────────────────────────────────────
  const ue = await getUnitEconomics(orgId, FROM, TO);

  console.log("\nReconciliation:");
  check("allocated total = underlying usage ($5700)", ue.reconciliation.matches && ue.reconciliation.usageTotalMicros === (5700n * M).toString(), ue.reconciliation.usageTotalMicros);

  console.log("\nCost per unit (3 grains):");
  const wf1 = ue.workflows.find((w) => w.id === ids.wf1)!;
  check("workflow: $4200 / 9800 tickets = $0.4285 (428571 micros)", wf1.metrics.find((m) => m.unit === "tickets_closed")?.costPerUnitMicros === "428571", JSON.stringify(wf1.metrics));
  check("workflow cost/run = $4200 (1 run)", wf1.costPerRunMicros === (4200n * M).toString());
  const cust = ue.customers.find((c) => c.ref === "__ue_cust__")!;
  check("customer: $4200 / $4000 = $1.05/unit (1_050_000 micros)", cust.metrics.find((m) => m.unit === "usd_revenue")?.costPerUnitMicros === "1050000", JSON.stringify(cust.metrics));
  const pl = ue.byProductLine.find((p) => p.id === ids.pl)! as typeof ue.byProductLine[number] & { metrics: { unit: string; costPerUnitMicros: string | null }[] };
  check("product line: $5200 / 2600 docs = $2.00/unit (2_000_000 micros)", pl.metrics.find((m) => m.unit === "docs_processed")?.costPerUnitMicros === "2000000", JSON.stringify(pl.metrics));

  console.log("\nAI COGS % of revenue uses only COGS-coded spend:");
  // PL total cost $5200 but COGS-coded only $4200 → 4200/10000 = 4200 bps (NOT 5200).
  check("product-line COGS = $4200 (not $5200 total)", pl.cogsMicros === (4200n * M).toString(), pl.cogsMicros);
  check("product-line COGS % = 42% (4200 bps)", pl.cogsPctBps === 4200, String(pl.cogsPctBps));
  check("board AI COGS = $4200 (org)", ue.board.cogsMicros === (4200n * M).toString(), ue.board.cogsMicros);
  check("board COGS % of revenue = 42% (4200 bps)", ue.board.cogsPctBps === 4200, String(ue.board.cogsPctBps));

  console.log("\nMissing outcome data shows honestly:");
  const wf2 = ue.workflows.find((w) => w.id === ids.wf2)!;
  check("workflow with no outcome → empty metrics (no fake ratio)", wf2.metrics.length === 0);
  check("workflow with no runs → null cost/run", wf2.costPerRunMicros === null);

  console.log("\nMargin alert:");
  const alerts = await detectMarginAlerts(orgId, FROM, TO);
  const custAlert = alerts.find((a) => a.grain === "customer" && a.ref === "__ue_cust__");
  check("customer cost > revenue → negative_margin alert fires", !!custAlert && custAlert.kind === "negative_margin", JSON.stringify(alerts.map((a) => `${a.grain}:${a.ref}:${a.kind}`)));
  check("alert states $200 margin at risk", custAlert?.marginAtRiskMicros === 200n * M, String(custAlert?.marginAtRiskMicros));

  await cleanup(orgId);
  console.log(failures === 0 ? "\n✅ all checks passed" : `\n❌ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

/** FK-safe teardown — STRICTLY scoped to the `__ue_`-prefixed test rows and the
 * isolated 2020-01 window. Never touches the org's real data. */
async function cleanup(orgId: string) {
  // Test outcome metrics (and their values) by key prefix.
  const testMetrics = await db.select({ id: outcomeMetrics.id }).from(outcomeMetrics)
    .where(and(eq(outcomeMetrics.orgId, orgId), like(outcomeMetrics.key, "__ue\\_%")));
  const metricIds = testMetrics.map((m) => m.id);
  if (metricIds.length) {
    await db.delete(outcomeValues).where(inArray(outcomeValues.metricId, metricIds));
    await db.delete(outcomeMetrics).where(inArray(outcomeMetrics.id, metricIds));
  }

  // Test usage events live only in the 2020-01 window.
  const evs = await db.select({ id: usageEvents.id }).from(usageEvents)
    .where(and(eq(usageEvents.orgId, orgId), between(usageEvents.timeBucket, FROM, TO)));
  const evIds = evs.map((e) => e.id);
  if (evIds.length) {
    await db.delete(usageAttribution).where(inArray(usageAttribution.usageEventId, evIds));
    await db.delete(costAllocations).where(inArray(costAllocations.usageEventId, evIds));
    await db.delete(usageEvents).where(inArray(usageEvents.id, evIds));
  }

  // Test workflows/runs/agents/sources/dimensions by name/code prefix.
  const testWfs = await db.select({ id: workflows.id }).from(workflows)
    .where(and(eq(workflows.orgId, orgId), like(workflows.name, "__ue\\_%")));
  const wfIds = testWfs.map((w) => w.id);
  if (wfIds.length) {
    await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, wfIds));
    await db.delete(workflows).where(inArray(workflows.id, wfIds));
  }
  await db.delete(agents).where(and(eq(agents.orgId, orgId), like(agents.name, "__ue\\_%")));
  await db.delete(attributionSources).where(and(eq(attributionSources.orgId, orgId), like(attributionSources.label, "__ue\\_%")));
  await db.delete(productLines).where(and(eq(productLines.orgId, orgId), like(productLines.code, "__ue\\_%")));
  await db.delete(glAccounts).where(and(eq(glAccounts.orgId, orgId), like(glAccounts.code, "__ue\\_%")));
  await db.delete(providerKeys).where(and(eq(providerKeys.orgId, orgId), like(providerKeys.keyFingerprint, "__ue\\_%")));
}

main().catch((e) => { console.error(e); process.exit(1); });
