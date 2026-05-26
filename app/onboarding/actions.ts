"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { organizations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
});

export async function createOrganization(formData: FormData) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthorized");

  const parsed = createOrgSchema.parse({
    name: formData.get("name"),
  });

  const slug = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const clerk = await clerkClient();

  // Create org in Clerk
  const clerkOrg = await clerk.organizations.createOrganization({
    name: parsed.name,
    slug,
    createdBy: clerkUserId,
  });

  // Create org in our DB (mirrors what the webhook would do)
  const [org] = await db
    .insert(organizations)
    .values({
      clerkOrgId: clerkOrg.id,
      name: parsed.name,
      slug: clerkOrg.slug ?? slug,
    })
    .onConflictDoNothing()
    .returning();

  // If the org already existed (race with webhook), look it up
  const orgRow =
    org ??
    (
      await db
        .select()
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrg.id))
        .limit(1)
    )[0];

  if (!orgRow) throw new Error("Failed to create organization");

  // Get the user's info from Clerk
  const clerkUser = await clerk.users.getUser(clerkUserId);

  // Create user in our DB
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

  // Set the user's active organization in Clerk
  await clerk.users.updateUser(clerkUserId, {
    publicMetadata: { orgId: orgRow.id },
  });

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
