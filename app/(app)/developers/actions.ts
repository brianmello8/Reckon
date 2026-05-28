"use server";

import { requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { developers, providerKeys, organizations } from "@/lib/db/schema";
import { eq, and, isNull, count, max } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { PLAN_LIMITS, PlanLimitError } from "@/lib/plans/limits";

const addDeveloperSchema = z.object({
  displayName: z.string().min(1).max(200),
  email: z.string().email(),
});

export async function addDeveloper(formData: FormData) {
  const user = await requireUser();

  const parsed = addDeveloperSchema.parse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
  });

  // Check plan limits
  const [org] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
  });

  const limits = PLAN_LIMITS[org?.plan ?? "free"];

  const [devCount] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ count: count(developers.id) })
      .from(developers)
      .where(
        and(eq(developers.orgId, user.orgId), isNull(developers.deletedAt))
      );
  });

  if (Number(devCount?.count ?? 0) >= limits.maxDevelopers) {
    throw new PlanLimitError(
      `Free plan supports up to ${limits.maxDevelopers} developers. Upgrade to Pro for unlimited.`,
      "maxDevelopers"
    );
  }

  const [dev] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .insert(developers)
      .values({
        orgId: user.orgId,
        displayName: parsed.displayName,
        email: parsed.email,
      })
      .returning();
  });

  // Sync developer count with Stripe
  const { inngest } = await import("@/lib/jobs/client");
  await inngest.send({
    name: "billing/developer-count.changed",
    data: { org_id: user.orgId },
  });

  revalidatePath("/developers");
  return { id: dev.id };
}

export async function getDevelopersWithStats() {
  const user = await requireUser();

  return withOrgContext(user.orgId, async (tx) => {
    const devs = await tx
      .select({
        id: developers.id,
        displayName: developers.displayName,
        email: developers.email,
        createdAt: developers.createdAt,
      })
      .from(developers)
      .where(
        and(
          eq(developers.orgId, user.orgId),
          isNull(developers.deletedAt)
        )
      )
      .orderBy(developers.displayName);

    // Get key counts and last polled per developer
    const keyStats = await tx
      .select({
        developerId: providerKeys.developerId,
        keyCount: count(providerKeys.id),
        lastPolled: max(providerKeys.lastPolledAt),
      })
      .from(providerKeys)
      .where(eq(providerKeys.orgId, user.orgId))
      .groupBy(providerKeys.developerId);

    const statsMap = new Map(
      keyStats.map((s) => [s.developerId, s])
    );

    return devs.map((dev) => {
      const stats = statsMap.get(dev.id);
      return {
        ...dev,
        keyCount: Number(stats?.keyCount ?? 0),
        lastActivity: stats?.lastPolled ?? null,
      };
    });
  });
}
