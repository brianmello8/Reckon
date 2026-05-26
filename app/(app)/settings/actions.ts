"use server";

import { requireAdmin } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const updateOrgSchema = z.object({
  name: z.string().min(2).max(100),
  digestTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
  digestTimezone: z.string().min(1),
});

export async function updateOrgSettings(formData: FormData) {
  const user = await requireAdmin();

  const parsed = updateOrgSchema.parse({
    name: formData.get("name"),
    digestTimeLocal: formData.get("digestTimeLocal"),
    digestTimezone: formData.get("digestTimezone"),
  });

  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(organizations)
      .set({
        name: parsed.name,
        digestTimeLocal: parsed.digestTimeLocal,
        digestTimezone: parsed.digestTimezone,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, user.orgId));
  });

  revalidatePath("/settings");
  return { success: true };
}
