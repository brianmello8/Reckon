"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { commitments, providers } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCommitmentStatus } from "@/lib/commitments/drawdown";

const toMicros = (d: number) => BigInt(Math.round(d * 1_000_000));

export async function getProvidersList() {
  return db.select({ key: providers.key, name: providers.displayName }).from(providers).orderBy(providers.displayName);
}

export async function getCommitments() {
  const user = await requireSurface("finance");
  const today = new Date().toISOString().slice(0, 10);
  const rows = await withOrgContext(user.orgId, async (tx) =>
    tx.select().from(commitments).where(eq(commitments.orgId, user.orgId)).orderBy(desc(commitments.startDate))
  );
  const out = [];
  for (const c of rows) {
    const s = await getCommitmentStatus(
      user.orgId,
      { id: c.id, provider: c.provider, type: c.type, amount: c.amount, startDate: c.startDate, endDate: c.endDate },
      today
    );
    out.push({
      id: c.id,
      provider: c.provider,
      type: c.type,
      currency: c.currency,
      amount: c.amount.toString(),
      startDate: c.startDate,
      endDate: c.endDate,
      effectiveRate: c.effectiveRate != null ? c.effectiveRate.toString() : null,
      notes: c.notes,
      derivedStatus: s.derivedStatus,
      consumed: s.consumedMicros.toString(),
      remaining: s.remainingMicros.toString(),
      pctConsumed: s.pctConsumed,
      projectedEndConsumed: s.projectedEndConsumedMicros.toString(),
      projectedRemaining: s.projectedRemainingMicros.toString(),
      daysRemaining: s.daysRemaining,
      dailyRunRate: s.dailyRunRateMicros.toString(),
      curve: s.curve,
      alerts: s.alerts.map((a) => ({
        kind: a.kind,
        amountAtRisk: a.amountAtRiskMicros.toString(),
        date: a.date,
        message: a.message,
      })),
    });
  }
  return out;
}

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  provider: z.string().min(1),
  type: z.enum(["committed_use", "prepaid_credit", "enterprise_agreement"]),
  amount: z.coerce.number().min(0),
  currency: z.string().length(3),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveRate: z.union([z.coerce.number(), z.null()]).optional(),
  notes: z.string().optional().or(z.literal("")),
});

export async function saveCommitment(input: z.input<typeof schema>) {
  const user = await requireSurface("finance");
  const p = schema.parse(input);
  const id = p.id && p.id !== "" ? p.id : null;
  const values = {
    provider: p.provider,
    type: p.type,
    amount: toMicros(p.amount),
    currency: p.currency.toUpperCase(),
    startDate: p.startDate,
    endDate: p.endDate,
    effectiveRate: p.effectiveRate != null ? toMicros(p.effectiveRate) : null,
    notes: p.notes || null,
  };
  await withOrgContext(user.orgId, async (tx) => {
    if (id) {
      const upd = await tx
        .update(commitments)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(commitments.id, id), eq(commitments.orgId, user.orgId)))
        .returning({ id: commitments.id });
      if (upd.length === 0) throw new Error("Commitment not found.");
    } else {
      await tx.insert(commitments).values({ orgId: user.orgId, ...values });
    }
  });
  revalidatePath("/finance/commitments");
  return { success: true };
}

export async function deleteCommitment(id: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx.delete(commitments).where(and(eq(commitments.id, id), eq(commitments.orgId, user.orgId)))
  );
  revalidatePath("/finance/commitments");
  return { success: true };
}
