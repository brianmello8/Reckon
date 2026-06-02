"use server";

import { requireSurface } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getExportView,
  generateExportBatch,
  supersedeBatch,
  markAcknowledged,
  getBatchForDownload,
  type GenerateResult,
} from "@/lib/export/build";
import type { TargetFormat } from "@/lib/export";

export async function getExportViewAction() {
  const user = await requireSurface("finance");
  return getExportView(user.orgId);
}

export async function generateBatchAction(input: {
  periodId: string;
  targetFormat: TargetFormat;
  codeSetId?: string | null;
  confirmSupersede?: boolean;
  lockOverrideReason?: string;
}): Promise<GenerateResult> {
  const user = await requireSurface("finance");
  const result = await generateExportBatch(user.orgId, {
    periodId: input.periodId,
    targetFormat: input.targetFormat,
    journalEntryIds: [], // all approved JEs in the period
    codeSetId: input.codeSetId ?? null,
    confirmSupersede: input.confirmSupersede,
    lockOverrideReason: input.lockOverrideReason,
    userId: user.userId,
  });
  if (result.status === "ok") revalidatePath("/finance/export");
  return result;
}

export async function supersedeBatchAction(batchId: string, reason: string) {
  const user = await requireSurface("finance");
  await supersedeBatch(user.orgId, batchId, reason);
  revalidatePath("/finance/export");
  return { success: true };
}

export async function acknowledgeBatchAction(batchId: string) {
  const user = await requireSurface("finance");
  await markAcknowledged(user.orgId, batchId);
  revalidatePath("/finance/export");
  return { success: true };
}

/** Returns the stored file bytes for client-side download (and marks downloaded). */
export async function downloadBatchAction(batchId: string) {
  const user = await requireSurface("finance");
  const file = await getBatchForDownload(user.orgId, batchId);
  revalidatePath("/finance/export");
  return file;
}
