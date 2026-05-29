"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { organizations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const ensureOrgSchema = z.object({
  clerkOrgId: z.string().min(1),
  name: z.string().min(2).max(100),
  slug: z.string().min(1),
});

/**
 * Mirror a just-created Clerk org (and its creator) into our DB synchronously,
 * so /dashboard never races the organization webhook. Idempotent — the webhook
 * remains the source of truth for ongoing membership changes.
 */
export async function ensureOrgRow(input: {
  clerkOrgId: string;
  name: string;
  slug: string;
}) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthorized");

  const parsed = ensureOrgSchema.parse(input);

  const [org] = await db
    .insert(organizations)
    .values({
      clerkOrgId: parsed.clerkOrgId,
      name: parsed.name,
      slug: parsed.slug,
    })
    .onConflictDoNothing()
    .returning();

  const orgRow =
    org ??
    (
      await db
        .select()
        .from(organizations)
        .where(eq(organizations.clerkOrgId, parsed.clerkOrgId))
        .limit(1)
    )[0];

  if (!orgRow) throw new Error("Failed to create organization");

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);

  await db
    .insert(users)
    .values({
      orgId: orgRow.id,
      clerkUserId,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        "Unknown",
      role: "admin",
    })
    .onConflictDoNothing();

  return { orgId: orgRow.id, slug: orgRow.slug };
}

export async function checkOrgExists() {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) return null;

  const org = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.clerkOrgId, clerkOrgId))
    .limit(1);

  return org[0] ?? null;
}
