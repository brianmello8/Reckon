"use server";

import { requireAdmin } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export async function getMembers() {
  const user = await requireAdmin();
  return withOrgContext(user.orgId, async (tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        surfaces: users.surfaces,
      })
      .from(users)
      .where(eq(users.orgId, user.orgId))
      .orderBy(users.name)
  );
}

const setSchema = z.object({
  userId: z.string().uuid(),
  surfaces: z.array(z.enum(["operations", "workflows", "finance"])),
});

/** Set a member's surface access. Admins always have all surfaces regardless. */
export async function setMemberSurfaces(userId: string, surfaces: string[]) {
  const admin = await requireAdmin();
  const parsed = setSchema.parse({ userId, surfaces });

  const updated = await withOrgContext(admin.orgId, async (tx) =>
    tx
      .update(users)
      .set({
        surfaces: parsed.surfaces.length
          ? parsed.surfaces
          : ["operations"],
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, parsed.userId), eq(users.orgId, admin.orgId)))
      .returning({ id: users.id })
  );
  if (updated.length === 0) throw new Error("Member not found.");

  revalidatePath("/members");
  return { success: true };
}
