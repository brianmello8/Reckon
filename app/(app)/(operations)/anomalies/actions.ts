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
        // developers.id is non-null via the inner join (anomalies.developerId
        // is now nullable for workflow anomalies, which this list excludes).
        developerId: developers.id,
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

  // Get the anomaly to check for Linear issue
  const [anomaly] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({
        id: anomalies.id,
        linearIssueId: anomalies.linearIssueId,
      })
      .from(anomalies)
      .where(
        and(eq(anomalies.id, anomalyId), eq(anomalies.orgId, user.orgId))
      )
      .limit(1);
  });

  if (!anomaly) throw new Error("Anomaly not found");

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

  // Close the Linear issue if one exists
  if (anomaly.linearIssueId) {
    try {
      const { getLinearClient } = await import("@/lib/linear/client");
      const linearClient = await getLinearClient(user.orgId);
      if (linearClient) {
        // Find the "Done" or "Canceled" state for the issue's team
        const issue = await linearClient.issue(anomaly.linearIssueId);
        const team = await issue.team;
        if (team) {
          const states = await team.states();
          const doneState = states.nodes.find(
            (s) => s.type === "completed" || s.name.toLowerCase() === "done"
          );
          if (doneState) {
            await linearClient.updateIssue(anomaly.linearIssueId, {
              stateId: doneState.id,
            });
            await linearClient.createComment({
              issueId: anomaly.linearIssueId,
              body: `Acknowledged in Reckon by ${user.name}`,
            });
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  revalidatePath("/anomalies");
  return { success: true };
}
