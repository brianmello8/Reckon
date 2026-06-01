"use server";

import { requireSurface } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import {
  costCenters,
  glAccounts,
  projects,
  entities,
  productLines,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export type DimensionKind =
  | "cost_center"
  | "gl_account"
  | "project"
  | "entity"
  | "product_line";

const tableFor = {
  cost_center: costCenters,
  gl_account: glAccounts,
  project: projects,
  entity: entities,
  product_line: productLines,
} as const;

/** All dimension master data for the org. */
export async function getDimensions() {
  const user = await requireSurface("finance");
  return withOrgContext(user.orgId, async (tx) => {
    const [cc, gl, pr, en, pl] = await Promise.all([
      tx.select().from(costCenters).where(eq(costCenters.orgId, user.orgId)),
      tx.select().from(glAccounts).where(eq(glAccounts.orgId, user.orgId)),
      tx.select().from(projects).where(eq(projects.orgId, user.orgId)),
      tx.select().from(entities).where(eq(entities.orgId, user.orgId)),
      tx.select().from(productLines).where(eq(productLines.orgId, user.orgId)),
    ]);
    return { costCenters: cc, glAccounts: gl, projects: pr, entities: en, productLines: pl };
  });
}

const base = {
  id: z.string().uuid().optional().or(z.literal("")),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
};
const schemas = {
  cost_center: z.object({
    ...base,
    parentId: z.string().uuid().optional().or(z.literal("")),
    ownerRef: z.string().max(200).optional().or(z.literal("")),
  }),
  gl_account: z.object({
    ...base,
    accountType: z.enum(["cogs", "opex_rnd", "opex_ga", "opex_sm", "other"]),
  }),
  project: z.object(base),
  entity: z.object({
    ...base,
    functionalCurrency: z.string().length(3),
  }),
  product_line: z.object(base),
} as const;

/** Create or update (when id present) a dimension. */
export async function saveDimension(
  kind: DimensionKind,
  raw: Record<string, string>
) {
  const user = await requireSurface("finance");
  const parsed = schemas[kind].parse(raw) as Record<string, string>;
  const id = parsed.id && parsed.id !== "" ? parsed.id : null;

  const values: Record<string, unknown> = { code: parsed.code.trim(), name: parsed.name.trim() };
  if (kind === "cost_center") {
    values.parentId = parsed.parentId && parsed.parentId !== "" ? parsed.parentId : null;
    values.ownerRef = parsed.ownerRef?.trim() || null;
    if (id && values.parentId === id) throw new Error("A cost center can't be its own parent.");
  }
  if (kind === "gl_account") values.accountType = parsed.accountType;
  if (kind === "entity") values.functionalCurrency = parsed.functionalCurrency.toUpperCase();

  const table = tableFor[kind];
  await withOrgContext(user.orgId, async (tx) => {
    if (id) {
      const updated = await tx
        .update(table)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(table.id, id), eq(table.orgId, user.orgId)))
        .returning({ id: table.id });
      if (updated.length === 0) throw new Error("Not found.");
    } else {
      await tx.insert(table).values({ orgId: user.orgId, ...values } as never);
    }
  });

  revalidatePath("/finance/dimensions");
  return { success: true };
}

export async function setDimensionStatus(
  kind: DimensionKind,
  id: string,
  status: "active" | "archived"
) {
  const user = await requireSurface("finance");
  const table = tableFor[kind];
  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(table)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(table.id, id), eq(table.orgId, user.orgId)));
  });
  revalidatePath("/finance/dimensions");
  return { success: true };
}
