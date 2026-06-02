import { db } from "@/lib/db/client";
import {
  erpCodeSets,
  erpCodes,
  dimensionMappings,
  exportBatches,
  glAccounts,
  costCenters,
  entities,
  projects,
  productLines,
  journalEntries,
  journalEntryLines,
} from "@/lib/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

/**
 * Chart-of-accounts upload + dimension mapping (Phase 13.3, §5k). The customer's
 * real codes are sourced by UPLOAD only — never an API. Export formatters prefer
 * a mapped real code; unmapped values keep the Reckon code and are flagged.
 */

export type Segment = "gl_account" | "cost_center" | "entity" | "project" | "product_line";
const SEGMENTS: Segment[] = ["gl_account", "cost_center", "entity", "project", "product_line"];
// Which segments actually appear on JE lines (and so affect a JE export).
const JE_SEGMENTS: Segment[] = ["gl_account", "cost_center", "entity", "project"];

export type CodeRow = { segment: Segment; code: string; name: string | null };

/** Store an uploaded code set + its rows (one upload = one code set). */
export async function createCodeSet(orgId: string, systemLabel: string, rows: CodeRow[], userId?: string) {
  const label = systemLabel.trim();
  if (!label) throw new Error("A system label is required.");
  const clean = rows.filter((r) => r.code.trim() && SEGMENTS.includes(r.segment));
  if (clean.length === 0) throw new Error("No valid code rows to import.");
  if (clean.length > 5000) throw new Error("Import at most 5000 codes at a time.");
  return db.transaction(async (tx) => {
    const [set] = await tx
      .insert(erpCodeSets)
      .values({ orgId, systemLabel: label, uploadedByUserId: userId ?? null })
      .returning({ id: erpCodeSets.id });
    // De-dupe (segment, code) within the upload (the unique index would reject dups).
    const seen = new Set<string>();
    const values = clean
      .filter((r) => {
        const k = `${r.segment}:${r.code.trim()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((r) => ({ orgId, codeSetId: set.id, segment: r.segment, code: r.code.trim(), name: r.name?.trim() || null }));
    await tx.insert(erpCodes).values(values);
    return { codeSetId: set.id, count: values.length };
  });
}

export async function deleteCodeSet(orgId: string, codeSetId: string) {
  await db.transaction(async (tx) => {
    // A batch may reference the set for provenance — detach (keep the batch).
    await tx.update(exportBatches).set({ codeSetId: null }).where(and(eq(exportBatches.orgId, orgId), eq(exportBatches.codeSetId, codeSetId)));
    await tx.delete(dimensionMappings).where(and(eq(dimensionMappings.orgId, orgId), eq(dimensionMappings.codeSetId, codeSetId)));
    await tx.delete(erpCodes).where(and(eq(erpCodes.orgId, orgId), eq(erpCodes.codeSetId, codeSetId)));
    await tx.delete(erpCodeSets).where(and(eq(erpCodeSets.orgId, orgId), eq(erpCodeSets.id, codeSetId)));
  });
}

/** Map (or, with empty erpCode, unmap) one Reckon value to a real code. */
export async function upsertMapping(
  orgId: string,
  codeSetId: string,
  reckonDimension: Segment,
  reckonValueId: string,
  erpCode: string
) {
  const code = erpCode.trim();
  if (!code) {
    await db
      .delete(dimensionMappings)
      .where(
        and(
          eq(dimensionMappings.orgId, orgId),
          eq(dimensionMappings.codeSetId, codeSetId),
          eq(dimensionMappings.reckonDimension, reckonDimension),
          eq(dimensionMappings.reckonValueId, reckonValueId)
        )
      );
    return { mapped: false };
  }
  // validated = the code actually exists in this code set for this segment.
  const [hit] = await db
    .select({ id: erpCodes.id })
    .from(erpCodes)
    .where(and(eq(erpCodes.orgId, orgId), eq(erpCodes.codeSetId, codeSetId), eq(erpCodes.segment, reckonDimension), eq(erpCodes.code, code)))
    .limit(1);
  const validated = !!hit;
  await db
    .insert(dimensionMappings)
    .values({ orgId, codeSetId, reckonDimension, reckonValueId, erpCode: code, validated })
    .onConflictDoUpdate({
      target: [dimensionMappings.codeSetId, dimensionMappings.reckonDimension, dimensionMappings.reckonValueId],
      set: { erpCode: code, validated, updatedAt: new Date() },
    });
  return { mapped: true, validated };
}

export async function getErpCodesView(orgId: string, selectedCodeSetId?: string) {
  const sets = await db
    .select({ id: erpCodeSets.id, label: erpCodeSets.systemLabel, uploadedAt: erpCodeSets.uploadedAt })
    .from(erpCodeSets)
    .where(eq(erpCodeSets.orgId, orgId))
    .orderBy(desc(erpCodeSets.uploadedAt));

  // Counts per set/segment.
  const counts = await db
    .select({ codeSetId: erpCodes.codeSetId, segment: erpCodes.segment, n: sql<number>`count(*)`.as("n") })
    .from(erpCodes)
    .where(eq(erpCodes.orgId, orgId))
    .groupBy(erpCodes.codeSetId, erpCodes.segment);
  const countBySet = new Map<string, Record<string, number>>();
  for (const c of counts) {
    const m = countBySet.get(c.codeSetId) ?? {};
    m[c.segment] = Number(c.n);
    countBySet.set(c.codeSetId, m);
  }

  const selected = selectedCodeSetId && sets.some((s) => s.id === selectedCodeSetId) ? selectedCodeSetId : sets[0]?.id ?? null;

  // Reckon dimension values.
  const [gl, cc, ent, prj, pl] = await Promise.all([
    db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).where(eq(glAccounts.orgId, orgId)),
    db.select({ id: costCenters.id, code: costCenters.code, name: costCenters.name }).from(costCenters).where(eq(costCenters.orgId, orgId)),
    db.select({ id: entities.id, code: entities.code, name: entities.name }).from(entities).where(eq(entities.orgId, orgId)),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(eq(projects.orgId, orgId)),
    db.select({ id: productLines.id, code: productLines.code, name: productLines.name }).from(productLines).where(eq(productLines.orgId, orgId)),
  ]);
  const reckonValues: Record<Segment, { id: string; code: string; name: string }[]> = {
    gl_account: gl,
    cost_center: cc,
    entity: ent,
    project: prj,
    product_line: pl,
  };

  // Values used on approved JE lines → "you can't export a code you haven't mapped".
  const usedRows = await db
    .select({
      glAccountId: journalEntryLines.glAccountId,
      costCenterId: journalEntryLines.costCenterId,
      entityId: journalEntryLines.entityId,
      projectId: journalEntryLines.projectId,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
    .where(and(eq(journalEntryLines.orgId, orgId), eq(journalEntries.status, "approved")));
  const used: Record<Segment, Set<string>> = {
    gl_account: new Set(),
    cost_center: new Set(),
    entity: new Set(),
    project: new Set(),
    product_line: new Set(),
  };
  for (const r of usedRows) {
    if (r.glAccountId) used.gl_account.add(r.glAccountId);
    if (r.costCenterId) used.cost_center.add(r.costCenterId);
    if (r.entityId) used.entity.add(r.entityId);
    if (r.projectId) used.project.add(r.projectId);
  }

  // Codes + mappings for the selected set.
  const codes = selected
    ? await db.select({ segment: erpCodes.segment, code: erpCodes.code, name: erpCodes.name }).from(erpCodes).where(and(eq(erpCodes.orgId, orgId), eq(erpCodes.codeSetId, selected)))
    : [];
  const codesBySegment: Record<string, { code: string; name: string | null }[]> = {};
  for (const c of codes) (codesBySegment[c.segment] ??= []).push({ code: c.code, name: c.name });

  const mappings = selected
    ? await db.select({ dim: dimensionMappings.reckonDimension, valueId: dimensionMappings.reckonValueId, erpCode: dimensionMappings.erpCode, validated: dimensionMappings.validated }).from(dimensionMappings).where(and(eq(dimensionMappings.orgId, orgId), eq(dimensionMappings.codeSetId, selected)))
    : [];
  const mapByKey = new Map(mappings.map((m) => [`${m.dim}:${m.valueId}`, m]));

  const matrix = SEGMENTS.map((seg) => ({
    segment: seg,
    appliesToJe: JE_SEGMENTS.includes(seg),
    options: (codesBySegment[seg] ?? []).sort((a, b) => a.code.localeCompare(b.code)),
    values: (reckonValues[seg] ?? [])
      .map((v) => {
        const m = mapByKey.get(`${seg}:${v.id}`);
        return {
          id: v.id,
          code: v.code,
          name: v.name,
          mappedCode: m?.erpCode ?? null,
          validated: m?.validated ?? false,
          usedInApprovedJe: used[seg].has(v.id),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));

  // Headline: Reckon values used in approved JEs with no mapping (export-blocking-ish flag).
  const unmappedUsed = matrix
    .filter((m) => m.appliesToJe)
    .flatMap((m) => m.values.filter((v) => v.usedInApprovedJe && !v.mappedCode).map((v) => ({ segment: m.segment, code: v.code, name: v.name })));

  return {
    codeSets: sets.map((s) => ({ id: s.id, label: s.label, uploadedAt: s.uploadedAt.toISOString(), counts: countBySet.get(s.id) ?? {} })),
    selectedCodeSetId: selected,
    matrix,
    unmappedUsed,
  };
}
