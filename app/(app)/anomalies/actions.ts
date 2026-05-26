"use server";

import { requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { anomalies, developers, users } from "@/lib/db/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getAnomalies(filter: "all" | "unacknowledged" | "acknowledged" = "all") {
  const user = await requireUser();

  return withOrgContext(user.orgId, async (tx) => {
    const conditions = [eq(anomalies.orgId, user.orgId)];

    if (filter === "unacknowledged") {
      conditions.push(isNull(anomalies.acknowledgedAt));
    } else if (filter === "acknowledged") {
      conditions.push(isNotNull(anomalies.acknowledgedAt));
    }

    return tx
      .select({
        id: anomalies.id,
        developerId: anomalies.developerId,
        developerName: developers.displayName,
        kind: anomalies.kind,
        severity: anomalies.severity,
        details: anomalies.details,
        detectedAt: anomalies.detectedAt,
        acknowledgedAt: anomalies.acknowledgedAt,
      })
      .from(anomalies)
      .innerJoin(developers, eq(anomalies.developerId, developers.id))
      .where(and(...conditions))
      .orderBy(desc(anomalies.detectedAt))
      .limit(100);
  });
}

export async function acknowledgeAnomaly(anomalyId: string) {
  const user = await requireUser();

  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(anomalies)
      .set({
        acknowledgedAt: new Date(),
        acknowledgedByUserId: user.userId,
      })
      .where(
        and(
          eq(anomalies.id, anomalyId),
          eq(anomalies.orgId, user.orgId)
        )
      );
  });

  revalidatePath("/anomalies");
  return { success: true };
}
