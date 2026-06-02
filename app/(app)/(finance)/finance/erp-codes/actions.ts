"use server";

import { requireSurface } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getErpCodesView,
  createCodeSet,
  deleteCodeSet,
  upsertMapping,
  type Segment,
  type CodeRow,
} from "@/lib/erp-codes/store";

export async function getErpCodesViewAction(selectedCodeSetId?: string) {
  const user = await requireSurface("finance");
  return getErpCodesView(user.orgId, selectedCodeSetId);
}

export async function createCodeSetAction(input: { systemLabel: string; segment: Segment; rows: { code: string; name: string }[] }) {
  const user = await requireSurface("finance");
  const rows: CodeRow[] = input.rows.map((r) => ({ segment: input.segment, code: r.code, name: r.name || null }));
  const res = await createCodeSet(user.orgId, input.systemLabel, rows, user.userId);
  revalidatePath("/finance/erp-codes");
  return res;
}

export async function deleteCodeSetAction(codeSetId: string) {
  const user = await requireSurface("finance");
  await deleteCodeSet(user.orgId, codeSetId);
  revalidatePath("/finance/erp-codes");
  return { success: true };
}

export async function upsertMappingAction(input: {
  codeSetId: string;
  reckonDimension: Segment;
  reckonValueId: string;
  erpCode: string;
}) {
  const user = await requireSurface("finance");
  const res = await upsertMapping(user.orgId, input.codeSetId, input.reckonDimension, input.reckonValueId, input.erpCode);
  revalidatePath("/finance/erp-codes");
  return res;
}
