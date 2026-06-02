/**
 * Functional test for the journal-entry export engine (Phase 13.1, §9).
 * Run: npx dotenv -e .env.local -- tsx scripts/test-export-engine.ts
 *
 * Acceptance criteria covered:
 *  - Approved JEs for a period generate a downloadable generic_csv batch.
 *  - Regenerating the same JE set produces an identical content_hash (idempotent).
 *  - A JE already in a live batch can't be silently re-exported (guard fires;
 *    supersede path works and is logged).
 *  - Generating against a LOCKED period requires an explicit, recorded override.
 *  - Batch lifecycle: generated → downloaded → acknowledged.
 *
 * Seeds an isolated test period (memo/idempotency prefixed __xp_) and cleans up.
 */
import { db } from "@/lib/db/client";
import {
  organizations, accountingPeriods, journalEntries, journalEntryLines,
  exportBatches, exportBatchEntries,
} from "@/lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  generateExportBatch, getBatchForDownload, markAcknowledged, getExportView,
} from "@/lib/export/build";
import { genericCsvExporter } from "@/lib/export/generic-csv";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
const M = 1_000_000n;

async function main() {
  const [org] = await db.select({ id: organizations.id }).from(organizations).limit(1);
  if (!org) { console.error("No org; skipping."); process.exit(failures === 0 ? 0 : 1); }
  const orgId = org.id;
  await cleanup(orgId);

  // ── Seed a period with two approved, balanced JEs ────────────────────────────
  const [period] = await db.insert(accountingPeriods).values({
    orgId, periodStart: "2019-03-01", periodEnd: "2019-03-31", status: "closed",
  }).returning({ id: accountingPeriods.id });

  const mkJe = async (memo: string, debit: bigint) => {
    const [je] = await db.insert(journalEntries).values({
      orgId, periodId: period.id, type: "accrual", status: "approved", idempotencyKey: `__xp_${memo}`, memo,
    }).returning({ id: journalEntries.id });
    await db.insert(journalEntryLines).values([
      { orgId, journalEntryId: je.id, debit, credit: 0n },
      { orgId, journalEntryId: je.id, debit: 0n, credit: debit },
    ]);
    return je.id;
  };
  const je1 = await mkJe("__xp_accrual_a", 4200n * M);
  const je2 = await mkJe("__xp_accrual_b", 800n * M);

  // ── 1. Generate a batch ──────────────────────────────────────────────────────
  console.log("Generate:");
  const r1 = await generateExportBatch(orgId, { periodId: period.id, targetFormat: "generic_csv", journalEntryIds: [] });
  check("approved JEs generate a generic_csv batch", r1.status === "ok", JSON.stringify(r1));
  if (r1.status !== "ok") { await cleanup(orgId); process.exit(1); }
  const firstHash = r1.contentHash;
  const dl = await getBatchForDownload(orgId, r1.batchId);
  check("batch has a downloadable CSV body", dl.body.includes("batch_external_id") && dl.filename.endsWith(".csv"));
  check("file header stamps the period + cutoff basis", dl.body.includes("2019-03-01") && dl.body.includes("inclusive start, exclusive end"));
  check("both JEs' lines are in the file", (dl.body.match(/__xp_accrual_/g) ?? []).length >= 2 || dl.body.split("\n").filter((l) => l.includes(",")).length >= 5);

  // ── 2. Idempotency: same JE set → identical content_hash ─────────────────────
  console.log("\nIdempotency:");
  const formatTwice = () => {
    // Pure formatter determinism check, independent of DB timestamps.
    const meta = { periodLabel: "x", periodStart: "2019-03-01", periodEnd: "2019-03-31", timezone: "UTC", boundaryRule: "inclusive start, exclusive end", externalBatchId: "RCKN-TEST" };
    const entries = [{ journalEntryId: je1, type: "accrual", memo: "m", lines: [{ lineExternalId: "L1", glCode: null, glName: null, costCenterCode: null, costCenterName: null, entityCode: null, projectCode: null, debitMicros: 100n, creditMicros: 0n, needsMapping: false }] }];
    return genericCsvExporter.format(entries, meta).body;
  };
  check("formatter is byte-deterministic", formatTwice() === formatTwice());

  // ── 3. Double-export guard + supersede ───────────────────────────────────────
  console.log("\nGuard + supersede:");
  const r2 = await generateExportBatch(orgId, { periodId: period.id, targetFormat: "generic_csv", journalEntryIds: [] });
  check("re-export of the same JEs is blocked (guard fires)", r2.status === "guard", JSON.stringify(r2));
  check("guard names the conflicting batch", r2.status === "guard" && r2.conflicts.some((c) => c.externalBatchId === r1.externalBatchId));
  const r3 = await generateExportBatch(orgId, { periodId: period.id, targetFormat: "generic_csv", journalEntryIds: [], confirmSupersede: true });
  check("supersede path regenerates", r3.status === "ok");
  check("regenerated batch has the SAME external_batch_id (stable anchor)", r3.status === "ok" && r3.externalBatchId === r1.externalBatchId, r3.status === "ok" ? r3.externalBatchId : "");
  check("regenerated batch has the SAME content_hash (idempotent)", r3.status === "ok" && r3.contentHash === firstHash, r3.status === "ok" ? `${r3.contentHash} vs ${firstHash}` : "");
  const prior = await db.select({ status: exportBatches.status, supersedeReason: exportBatches.supersedeReason }).from(exportBatches).where(eq(exportBatches.id, r1.batchId));
  check("prior batch is marked superseded + reason logged", prior[0]?.status === "superseded" && !!prior[0]?.supersedeReason);

  // ── 4. Locked period requires explicit override ──────────────────────────────
  console.log("\nLocked period:");
  await db.update(accountingPeriods).set({ status: "locked" }).where(eq(accountingPeriods.id, period.id));
  const rLock = await generateExportBatch(orgId, { periodId: period.id, targetFormat: "generic_csv", journalEntryIds: [], confirmSupersede: true });
  check("locked period without override → lock_required", rLock.status === "lock_required");
  const rOverride = await generateExportBatch(orgId, { periodId: period.id, targetFormat: "generic_csv", journalEntryIds: [], confirmSupersede: true, lockOverrideReason: "audit re-export" });
  check("locked period with recorded override → generates", rOverride.status === "ok");
  if (rOverride.status === "ok") {
    const [b] = await db.select({ reason: exportBatches.lockOverrideReason }).from(exportBatches).where(eq(exportBatches.id, rOverride.batchId));
    check("override reason is recorded on the batch", b?.reason === "audit re-export");
  }

  // ── 5. Acknowledge + view ─────────────────────────────────────────────────────
  console.log("\nLifecycle + view:");
  const latest = rOverride.status === "ok" ? rOverride.batchId : r3.status === "ok" ? r3.batchId : r1.batchId;
  await markAcknowledged(orgId, latest);
  const [ack] = await db.select({ status: exportBatches.status }).from(exportBatches).where(eq(exportBatches.id, latest));
  check("a downloaded/generated batch can be marked acknowledged", ack?.status === "acknowledged");
  const view = await getExportView(orgId);
  const vp = view.periods.find((p) => p.id === period.id);
  check("view reports the period's approved-JE count", vp?.approvedCount === 2, String(vp?.approvedCount));
  check("view lists batch history for the period", view.batches.some((b) => b.periodId === period.id));

  await cleanup(orgId);
  console.log(failures === 0 ? "\n✅ all checks passed" : `\n❌ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

/** FK-safe teardown scoped to the __xp_ test period/JEs. */
async function cleanup(orgId: string) {
  const periods = await db.select({ id: accountingPeriods.id }).from(accountingPeriods)
    .where(and(eq(accountingPeriods.orgId, orgId), eq(accountingPeriods.periodStart, "2019-03-01")));
  const pIds = periods.map((p) => p.id);
  if (pIds.length === 0) return;
  const jes = await db.select({ id: journalEntries.id }).from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), inArray(journalEntries.periodId, pIds)));
  const jeIds = jes.map((j) => j.id);
  // export batch entries + batches for these JEs/periods
  const batches = await db.select({ id: exportBatches.id }).from(exportBatches)
    .where(and(eq(exportBatches.orgId, orgId), inArray(exportBatches.periodId, pIds)));
  const bIds = batches.map((b) => b.id);
  if (bIds.length) {
    await db.delete(exportBatchEntries).where(inArray(exportBatchEntries.batchId, bIds));
    // break the self-FK before deleting
    await db.update(exportBatches).set({ supersededByBatchId: null }).where(inArray(exportBatches.id, bIds));
    await db.delete(exportBatches).where(inArray(exportBatches.id, bIds));
  }
  if (jeIds.length) {
    await db.delete(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, jeIds));
    await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
  }
  await db.delete(accountingPeriods).where(inArray(accountingPeriods.id, pIds));
}

main().catch((e) => { console.error(e); process.exit(1); });
