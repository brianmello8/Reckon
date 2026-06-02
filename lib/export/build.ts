import { db } from "@/lib/db/client";
import {
  journalEntries,
  journalEntryLines,
  accountingPeriods,
  glAccounts,
  costCenters,
  entities,
  projects,
  exportBatches,
  exportBatchEntries,
} from "@/lib/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { getReportingTimezone } from "@/lib/close/cutoff";
import { getExporter, validateExport, type TargetFormat } from "./index";
import { externalBatchId, lineExternalId, sha256Hex } from "./format";
import type { ExportEntry } from "./types";

/** The cutoff boundary rule from Phase 11.1, stamped into every export header. */
const BOUNDARY_RULE = "inclusive start, exclusive end";

type Tx = typeof db;

/** Approved JEs for a period, built into canonical ExportEntry[] with dimension
 * codes/names resolved. Dimensions carry Reckon codes (real-code mapping is 13.3),
 * flagged needsMapping. */
async function buildEntries(tx: Tx, orgId: string, periodId: string, jeIds: string[]): Promise<ExportEntry[]> {
  if (jeIds.length === 0) return [];
  const jes = await tx
    .select({ id: journalEntries.id, type: journalEntries.type, memo: journalEntries.memo, status: journalEntries.status })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.periodId, periodId), inArray(journalEntries.id, jeIds)));
  const approved = jes.filter((j) => j.status === "approved");

  const lines = await tx
    .select()
    .from(journalEntryLines)
    .where(and(eq(journalEntryLines.orgId, orgId), inArray(journalEntryLines.journalEntryId, approved.map((j) => j.id))));

  const [gl, cc, ent, prj] = await Promise.all([
    tx.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).where(eq(glAccounts.orgId, orgId)),
    tx.select({ id: costCenters.id, code: costCenters.code, name: costCenters.name }).from(costCenters).where(eq(costCenters.orgId, orgId)),
    tx.select({ id: entities.id, code: entities.code }).from(entities).where(eq(entities.orgId, orgId)),
    tx.select({ id: projects.id, code: projects.code }).from(projects).where(eq(projects.orgId, orgId)),
  ]);
  const glMap = new Map(gl.map((x) => [x.id, x]));
  const ccMap = new Map(cc.map((x) => [x.id, x]));
  const entMap = new Map(ent.map((x) => [x.id, x.code]));
  const prjMap = new Map(prj.map((x) => [x.id, x.code]));

  const linesByJe = new Map<string, typeof lines>();
  for (const l of lines) (linesByJe.get(l.journalEntryId) ?? linesByJe.set(l.journalEntryId, []).get(l.journalEntryId)!).push(l);

  return approved.map((j) => ({
    journalEntryId: j.id,
    type: j.type,
    memo: j.memo,
    lines: (linesByJe.get(j.id) ?? []).map((l) => ({
      lineExternalId: lineExternalId(orgId, j.id, l.id),
      glCode: l.glAccountId ? glMap.get(l.glAccountId)?.code ?? null : null,
      glName: l.glAccountId ? glMap.get(l.glAccountId)?.name ?? null : null,
      costCenterCode: l.costCenterId ? ccMap.get(l.costCenterId)?.code ?? null : null,
      costCenterName: l.costCenterId ? ccMap.get(l.costCenterId)?.name ?? null : null,
      entityCode: l.entityId ? entMap.get(l.entityId) ?? null : null,
      projectCode: l.projectId ? prjMap.get(l.projectId) ?? null : null,
      debitMicros: l.debit,
      creditMicros: l.credit,
      // 13.1 always carries Reckon codes (no ERP code-set yet) → flag any coded line.
      needsMapping: !!(l.glAccountId || l.costCenterId || l.entityId || l.projectId),
    })),
  }));
}

export type GenerateInput = {
  periodId: string;
  targetFormat: TargetFormat;
  journalEntryIds: string[];
  confirmSupersede?: boolean;
  lockOverrideReason?: string;
  userId?: string;
};

export type GenerateResult =
  | { status: "ok"; batchId: string; externalBatchId: string; filename: string; contentHash: string; needsMappingCount: number }
  | { status: "lock_required"; periodLabel: string }
  | { status: "empty" }
  | { status: "invalid"; errors: string[] }
  | { status: "guard"; conflicts: { batchId: string; externalBatchId: string; downloadedAt: string | null; jeIds: string[] }[] };

/** Generate (or refuse) an export batch. Returns a discriminated result rather
 * than throwing for the expected control-flow cases (lock / guard / empty). */
export async function generateExportBatch(orgId: string, input: GenerateInput): Promise<GenerateResult> {
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.id, input.periodId), eq(accountingPeriods.orgId, orgId)))
    .limit(1);
  if (!period) throw new Error("Period not found.");

  const periodLabel = `${period.periodStart}…${period.periodEnd}`;
  // LOCKED periods require an explicit, recorded override (closed periods are fine).
  if (period.status === "locked" && !input.lockOverrideReason?.trim()) {
    return { status: "lock_required", periodLabel };
  }

  // Only approved JEs in this period are exportable. Empty selection = all of them.
  const approved = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.periodId, input.periodId),
        eq(journalEntries.status, "approved"),
        ...(input.journalEntryIds.length ? [inArray(journalEntries.id, input.journalEntryIds)] : [])
      )
    );
  const jeIds = approved.map((j) => j.id);
  if (jeIds.length === 0) return { status: "empty" };

  // Double-export guard: any selected JE already in a non-superseded batch?
  const existing = await db
    .select({
      batchId: exportBatches.id,
      externalBatchId: exportBatches.externalBatchId,
      downloadedAt: exportBatches.downloadedAt,
      status: exportBatches.status,
      journalEntryId: exportBatchEntries.journalEntryId,
    })
    .from(exportBatchEntries)
    .innerJoin(exportBatches, eq(exportBatches.id, exportBatchEntries.batchId))
    .where(and(eq(exportBatchEntries.orgId, orgId), inArray(exportBatchEntries.journalEntryId, jeIds)));
  const conflicting = existing.filter((r) => r.status !== "superseded");
  if (conflicting.length > 0 && !input.confirmSupersede) {
    const byBatch = new Map<string, { batchId: string; externalBatchId: string; downloadedAt: string | null; jeIds: string[] }>();
    for (const r of conflicting) {
      const entry = byBatch.get(r.batchId) ?? {
        batchId: r.batchId,
        externalBatchId: r.externalBatchId,
        downloadedAt: r.downloadedAt ? r.downloadedAt.toISOString() : null,
        jeIds: [],
      };
      entry.jeIds.push(r.journalEntryId);
      byBatch.set(r.batchId, entry);
    }
    return { status: "guard", conflicts: [...byBatch.values()] };
  }

  // Build canonical entries + render the file (deterministic).
  const tz = await getReportingTimezone(orgId, period.entityId);
  const ebid = externalBatchId(orgId, input.periodId, jeIds);
  const entries = await buildEntries(db, orgId, input.periodId, jeIds);
  const meta = {
    periodLabel,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    timezone: tz,
    boundaryRule: BOUNDARY_RULE,
    externalBatchId: ebid,
  };

  // Per-format validator BLOCKS generation — never emit a structurally bad file.
  const errors = validateExport(input.targetFormat, entries, meta);
  if (errors.length > 0) return { status: "invalid", errors };

  const file = getExporter(input.targetFormat).format(entries, meta);
  const contentHash = sha256Hex(file.body);
  // Lines carrying a Reckon code with no real ERP-code mapping yet (13.3).
  const needsMappingCount = entries.reduce((a, e) => a + e.lines.filter((l) => l.needsMapping).length, 0);

  return db.transaction(async (tx) => {
    // Supersede any conflicting non-superseded batches (confirmed by the caller).
    const supersedeIds = [...new Set(conflicting.map((r) => r.batchId))];
    const [batch] = await tx
      .insert(exportBatches)
      .values({
        orgId,
        periodId: input.periodId,
        targetFormat: input.targetFormat,
        externalBatchId: ebid,
        contentHash,
        filename: file.filename,
        mimetype: file.mimetype,
        body: file.body,
        needsMappingCount,
        status: "generated",
        lockOverrideReason: input.lockOverrideReason?.trim() || null,
        generatedByUserId: input.userId ?? null,
      })
      .returning({ id: exportBatches.id });
    await tx.insert(exportBatchEntries).values(jeIds.map((id) => ({ orgId, batchId: batch.id, journalEntryId: id })));
    if (supersedeIds.length > 0) {
      await tx
        .update(exportBatches)
        .set({ status: "superseded", supersededByBatchId: batch.id, supersedeReason: "Re-exported with the same/overlapping JE set" })
        .where(and(eq(exportBatches.orgId, orgId), inArray(exportBatches.id, supersedeIds)));
    }
    return { status: "ok" as const, batchId: batch.id, externalBatchId: ebid, filename: file.filename, contentHash, needsMappingCount };
  });
}

export async function supersedeBatch(orgId: string, batchId: string, reason: string) {
  const r = reason.trim();
  if (!r) throw new Error("A supersede reason is required.");
  const updated = await db
    .update(exportBatches)
    .set({ status: "superseded", supersedeReason: r })
    .where(and(eq(exportBatches.orgId, orgId), eq(exportBatches.id, batchId), inArray(exportBatches.status, ["generated", "downloaded"])))
    .returning({ id: exportBatches.id });
  if (updated.length === 0) throw new Error("Only a generated/downloaded batch can be superseded.");
}

/** Serve the stored bytes (exactly what was hashed) and mark downloaded. */
export async function getBatchForDownload(orgId: string, batchId: string) {
  const [b] = await db
    .select({ filename: exportBatches.filename, mimetype: exportBatches.mimetype, body: exportBatches.body, status: exportBatches.status })
    .from(exportBatches)
    .where(and(eq(exportBatches.orgId, orgId), eq(exportBatches.id, batchId)))
    .limit(1);
  if (!b) throw new Error("Batch not found.");
  if (b.status === "generated") {
    await db.update(exportBatches).set({ status: "downloaded", downloadedAt: new Date() }).where(and(eq(exportBatches.orgId, orgId), eq(exportBatches.id, batchId)));
  }
  return b;
}

export async function markAcknowledged(orgId: string, batchId: string) {
  const updated = await db
    .update(exportBatches)
    .set({ status: "acknowledged", acknowledgedAt: new Date() })
    .where(and(eq(exportBatches.orgId, orgId), eq(exportBatches.id, batchId), inArray(exportBatches.status, ["generated", "downloaded"])))
    .returning({ id: exportBatches.id });
  if (updated.length === 0) throw new Error("Only a generated/downloaded batch can be acknowledged.");
}

/** Page view: periods, approved/exported counts, and batch history. */
export async function getExportView(orgId: string) {
  const periods = await db
    .select()
    .from(accountingPeriods)
    .where(eq(accountingPeriods.orgId, orgId))
    .orderBy(desc(accountingPeriods.periodStart));

  const approvedJes = await db
    .select({ id: journalEntries.id, periodId: journalEntries.periodId, type: journalEntries.type, memo: journalEntries.memo })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.status, "approved")));

  // JE ids currently in a non-superseded batch.
  const inBatch = await db
    .select({ journalEntryId: exportBatchEntries.journalEntryId, status: exportBatches.status })
    .from(exportBatchEntries)
    .innerJoin(exportBatches, eq(exportBatches.id, exportBatchEntries.batchId))
    .where(eq(exportBatchEntries.orgId, orgId));
  const exportedJe = new Set(inBatch.filter((r) => r.status !== "superseded").map((r) => r.journalEntryId));

  const batches = await db
    .select()
    .from(exportBatches)
    .where(eq(exportBatches.orgId, orgId))
    .orderBy(desc(exportBatches.generatedAt));
  const batchEntryCounts = await db
    .select({ batchId: exportBatchEntries.batchId, n: exportBatchEntries.journalEntryId })
    .from(exportBatchEntries)
    .where(eq(exportBatchEntries.orgId, orgId));
  const countByBatch = new Map<string, number>();
  for (const r of batchEntryCounts) countByBatch.set(r.batchId, (countByBatch.get(r.batchId) ?? 0) + 1);

  const jesByPeriod = new Map<string, { approved: number; exported: number; notExported: { id: string; type: string; memo: string | null }[] }>();
  for (const p of periods) jesByPeriod.set(p.id, { approved: 0, exported: 0, notExported: [] });
  for (const j of approvedJes) {
    const slot = jesByPeriod.get(j.periodId);
    if (!slot) continue;
    slot.approved += 1;
    if (exportedJe.has(j.id)) slot.exported += 1;
    else slot.notExported.push({ id: j.id, type: j.type, memo: j.memo });
  }

  return {
    periods: periods.map((p) => {
      const s = jesByPeriod.get(p.id)!;
      return {
        id: p.id,
        label: `${p.periodStart} → ${p.periodEnd}`,
        status: p.status,
        approvedCount: s.approved,
        exportedCount: s.exported,
        notExportedCount: s.approved - s.exported,
        notExported: s.notExported,
      };
    }),
    batches: batches.map((b) => ({
      id: b.id,
      periodId: b.periodId,
      targetFormat: b.targetFormat,
      externalBatchId: b.externalBatchId,
      contentHash: b.contentHash.slice(0, 12),
      status: b.status,
      jeCount: countByBatch.get(b.id) ?? 0,
      needsMappingCount: b.needsMappingCount,
      lockOverrideReason: b.lockOverrideReason,
      supersedeReason: b.supersedeReason,
      generatedAt: b.generatedAt.toISOString(),
      downloadedAt: b.downloadedAt ? b.downloadedAt.toISOString() : null,
      acknowledgedAt: b.acknowledgedAt ? b.acknowledgedAt.toISOString() : null,
    })),
  };
}
