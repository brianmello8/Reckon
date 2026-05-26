import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { users, organizations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export type AuthUser = {
  userId: string;
  orgId: string;
  clerkUserId: string;
  clerkOrgId: string;
  email: string;
  name: string;
  role: "admin" | "member";
  orgName: string;
  orgSlug: string;
};

/**
 * Returns the current authenticated user and their org, or null if not signed in.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();

  if (!clerkUserId || !clerkOrgId) return null;

  const org = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerkOrgId, clerkOrgId))
    .limit(1);

  if (!org[0]) return null;

  const user = await db
    .select()
    .from(users)
    .where(
      and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, org[0].id))
    )
    .limit(1);

  if (!user[0]) return null;

  return {
    userId: user[0].id,
    orgId: org[0].id,
    clerkUserId,
    clerkOrgId,
    email: user[0].email,
    name: user[0].name,
    role: user[0].role,
    orgName: org[0].name,
    orgSlug: org[0].slug,
  };
}

/**
 * Returns the current user or throws a redirect to sign-in.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * Returns the current user if they're an admin, or throws.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Forbidden: admin role required");
  }
  return user;
}
