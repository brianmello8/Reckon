/**
 * Functional test for CoA upload & dimension mapping (Phase 13.3, §5k).
 * Run: npx dotenv -e .env.local -- tsx scripts/test-erp-mapping.ts
 *
 * Acceptance criteria:
 *  - A CoA CSV uploads and parses into an erp_code_set.
 *  - Reckon dimension values map to uploaded real codes.
 *  - Approved-JE dimension values with no mapping are flagged.
 *  - A generated export uses mapped real codes where present (Reckon codes + flag
 *    where not).
 *
 * Seeds __em_-prefixed Reckon dimensions + an isolated 2018-05 period; cleans up.
 */
import { db } from "@/lib/db/client";
import {
  organizations, glAccounts, costCenters, accountingPeriods, journalEntries, journalEntryLines,
  erpCodeSets, erpCodes, dimensionMappings, exportBatches, exportBatchEntries,
} from "@/lib/db/schema";
import { and, eq, inArray, like } from "drizzle-orm";
import { createCodeSet, upsertMapping, getErpCodesView } from "@/lib/erp-codes/store";
import { generateExportBatch, getBatchForDownload } from "@/lib/export/build";

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

  // ── Seed Reckon dimensions + an approved JE that uses them ───────────────────
  const [gl] = await db.insert(glAccounts).values({ orgId, code: "__em_GL1", name: "Reckon AI COGS", accountType: "cogs" }).returning({ id: glAccounts.id });
  const [cc] = await db.insert(costCenters).values({ orgId, code: "__em_CC1", name: "Reckon Eng" }).returning({ id: costCenters.id });
  const [period] = await db.insert(accountingPeriods).values({ orgId, periodStart: "2018-05-01", periodEnd: "2018-05-31", status: "closed" }).returning({ id: accountingPeriods.id });
  const [je] = await db.insert(journalEntries).values({ orgId, periodId: period.id, type: "accrual", status: "approved", idempotencyKey: "__em_je", memo: "mapping test" }).returning({ id: journalEntries.id });
  await db.insert(journalEntryLines).values([
    { orgId, journalEntryId: je.id, glAccountId: gl.id, costCenterId: cc.id, debit: 1000n * M, credit: 0n },
    { orgId, journalEntryId: je.id, glAccountId: gl.id, debit: 0n, credit: 1000n * M },
  ]);

  // ── 1. Upload a CoA into a code set ──────────────────────────────────────────
  console.log("Upload:");
  const { codeSetId, count } = await createCodeSet(orgId, "__em NetSuite CoA", [
    { segment: "gl_account", code: "60000", name: "AI COGS" },
    { segment: "gl_account", code: "60010", name: "AI Opex" },
    { segment: "cost_center", code: "ENG", name: "Engineering" },
  ]);
  check("CoA uploads into an erp_code_set (3 codes)", count === 3 && !!codeSetId);

  // ── 2. Map a Reckon value to a real code ─────────────────────────────────────
  console.log("\nMap:");
  const m = await upsertMapping(orgId, codeSetId, "gl_account", gl.id, "60000");
  check("Reckon GL maps to a real code, validated", m.mapped === true && m.validated === true);
  // Leave the cost center UNMAPPED to test the flag.

  // ── 3. Unmapped-but-used is flagged ──────────────────────────────────────────
  console.log("\nFlag unmapped-but-used:");
  const view = await getErpCodesView(orgId, codeSetId);
  const flagged = view.unmappedUsed.some((u) => u.segment === "cost_center" && u.code === "__em_CC1");
  check("cost center used in an approved JE with no mapping is flagged", flagged, JSON.stringify(view.unmappedUsed));
  const glRow = view.matrix.find((s) => s.segment === "gl_account")!.values.find((v) => v.id === gl.id);
  check("matrix shows the GL mapping", glRow?.mappedCode === "60000");

  // ── 4. Export uses mapped real codes where present ───────────────────────────
  console.log("\nExport with mappings:");
  const r = await generateExportBatch(orgId, { periodId: period.id, targetFormat: "netsuite_csv", journalEntryIds: [], codeSetId });
  check("export generates", r.status === "ok", JSON.stringify(r));
  if (r.status === "ok") {
    const body = (await getBatchForDownload(orgId, r.batchId)).body;
    check("file carries the MAPPED GL code (60000)", body.includes("60000"));
    check("file does NOT carry the Reckon GL code (__em_GL1)", !body.includes("__em_GL1"));
    check("unmapped cost center falls back to the Reckon code (__em_CC1)", body.includes("__em_CC1"));
    check("needs-mapping count > 0 (the unmapped cost-center line)", r.needsMappingCount > 0, String(r.needsMappingCount));
  }

  // Export WITHOUT a code set → all Reckon codes, all flagged (supersede the prior).
  const r2 = await generateExportBatch(orgId, { periodId: period.id, targetFormat: "generic_csv", journalEntryIds: [], confirmSupersede: true });
  if (r2.status === "ok") {
    const body = (await getBatchForDownload(orgId, r2.batchId)).body;
    check("no-code-set export carries Reckon codes", body.includes("__em_GL1"));
  } else check("no-code-set export generates", false, JSON.stringify(r2));

  await cleanup(orgId);
  console.log(failures === 0 ? "\n✅ all checks passed" : `\n❌ ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup(orgId: string) {
  const sets = await db.select({ id: erpCodeSets.id }).from(erpCodeSets).where(and(eq(erpCodeSets.orgId, orgId), like(erpCodeSets.systemLabel, "__em%")));
  const setIds = sets.map((s) => s.id);
  const periods = await db.select({ id: accountingPeriods.id }).from(accountingPeriods).where(and(eq(accountingPeriods.orgId, orgId), eq(accountingPeriods.periodStart, "2018-05-01")));
  const pIds = periods.map((p) => p.id);
  if (pIds.length) {
    const batches = await db.select({ id: exportBatches.id }).from(exportBatches).where(and(eq(exportBatches.orgId, orgId), inArray(exportBatches.periodId, pIds)));
    const bIds = batches.map((b) => b.id);
    if (bIds.length) {
      await db.delete(exportBatchEntries).where(inArray(exportBatchEntries.batchId, bIds));
      await db.update(exportBatches).set({ supersededByBatchId: null }).where(inArray(exportBatches.id, bIds));
      await db.delete(exportBatches).where(inArray(exportBatches.id, bIds));
    }
    const jes = await db.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.orgId, orgId), inArray(journalEntries.periodId, pIds)));
    const jeIds = jes.map((j) => j.id);
    if (jeIds.length) {
      await db.delete(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, jeIds));
      await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
    }
    await db.delete(accountingPeriods).where(inArray(accountingPeriods.id, pIds));
  }
  if (setIds.length) {
    await db.delete(dimensionMappings).where(inArray(dimensionMappings.codeSetId, setIds));
    await db.delete(erpCodes).where(inArray(erpCodes.codeSetId, setIds));
    await db.delete(erpCodeSets).where(inArray(erpCodeSets.id, setIds));
  }
  await db.delete(glAccounts).where(and(eq(glAccounts.orgId, orgId), like(glAccounts.code, "__em%")));
  await db.delete(costCenters).where(and(eq(costCenters.orgId, orgId), like(costCenters.code, "__em%")));
}

main().catch((e) => { console.error(e); process.exit(1); });
