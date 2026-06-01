"use server";

import { requireSurface, hasSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { budgets } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDrill } from "./queries";

/** Drill-through for a dimension value. Developer names only if the viewer
 * also holds operations access (finance is a dimensions lens, not a people lens). */
export async function getDrillAction(
  dim: "cost_center" | "gl_account" | "entity" | "project" | "product_line",
  scopeId: string | null,
  from: string,
  to: string
) {
  const user = await requireSurface("finance");
  return getDrill(user.orgId, dim, scopeId, from, to, hasSurface(user, "operations"));
}

export async function getBudgets(period: string) {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) =>
    tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.orgId, user.orgId), eq(budgets.period, period)))
  );
}

const budgetSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  scopeType: z.enum(["cost_center", "gl_account", "project"]),
  scopeId: z.string().uuid(),
  period: z.string().regex(/^\d{4}(-\d{2})?$/),
  amount: z.coerce.number().min(0),
  currency: z.string().length(3).optional(),
});

export async function saveBudget(raw: Record<string, string>) {
  const user = await requireSurface("finance");
  const p = budgetSchema.parse(raw);
  const amountMicros = BigInt(Math.round(p.amount * 1_000_000));
  const id = p.id && p.id !== "" ? p.id : null;
  const currency = (p.currency ?? "USD").toUpperCase();

  await withOrgContext(user.orgId, async (tx) => {
    if (id) {
      const upd = await tx
        .update(budgets)
        .set({ scopeType: p.scopeType, scopeId: p.scopeId, period: p.period, amountMicros, currency, updatedAt: new Date() })
        .where(and(eq(budgets.id, id), eq(budgets.orgId, user.orgId)))
        .returning({ id: budgets.id });
      if (upd.length === 0) throw new Error("Budget not found.");
    } else {
      await tx
        .insert(budgets)
        .values({ orgId: user.orgId, scopeType: p.scopeType, scopeId: p.scopeId, period: p.period, amountMicros, currency })
        .onConflictDoUpdate({
          target: [budgets.orgId, budgets.scopeType, budgets.scopeId, budgets.period],
          set: { amountMicros, currency, updatedAt: new Date() },
        });
    }
  });
  revalidatePath("/finance");
  return { success: true };
}

export async function deleteBudget(id: string) {
  const user = await requireSurface("finance");
  await withOrgContext(user.orgId, async (tx) =>
    tx.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.orgId, user.orgId)))
  );
  revalidatePath("/finance");
  return { success: true };
}
