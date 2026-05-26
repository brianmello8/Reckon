"use server";

import { requireAdmin } from "@/lib/auth";
import { inngest } from "@/lib/jobs/client";

export async function triggerOrgIngestion() {
  const user = await requireAdmin();

  await inngest.send({
    name: "ingestion/org.requested",
    data: { org_id: user.orgId },
  });

  return { success: true };
}
