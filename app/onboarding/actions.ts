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

  // Idempotent: if we already have a row for this Clerk org, use it. This is the
  // common path on retries/back-navigation and avoids any slug churn.
  let orgRow = (
    await db
      .select()
      .from(organizations)
      .where(eq(organizations.clerkOrgId, parsed.clerkOrgId))
      .limit(1)
  )[0];

  if (!orgRow) {
    // `slug` is UNIQUE. A retry can create a second Clerk org with the same name
    // (→ same slug) — find a free slug instead of throwing on the collision.
    let slug = parsed.slug;
    for (let i = 0; i < 6; i++) {
      const taken = (
        await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.slug, slug))
          .limit(1)
      )[0];
      if (!taken) break;
      slug = `${parsed.slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    orgRow =
      (
        await db
          .insert(organizations)
          .values({ clerkOrgId: parsed.clerkOrgId, name: parsed.name, slug })
          .onConflictDoNothing({ target: organizations.clerkOrgId })
          .returning()
      )[0] ??
      (
        await db
          .select()
          .from(organizations)
          .where(eq(organizations.clerkOrgId, parsed.clerkOrgId))
          .limit(1)
      )[0];
  }

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
