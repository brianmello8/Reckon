import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { users, organizations } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export type Surface = "operations" | "workflows" | "finance";

export type AuthUser = {
  userId: string;
  orgId: string;
  clerkUserId: string;
  clerkOrgId: string;
  email: string;
  name: string;
  role: "admin" | "member";
  surfaces: Surface[];
  orgName: string;
  orgSlug: string;
  plan: "free" | "pro" | "entry";
  financeEnabled: boolean;
  trialEndsAt: string | null;
};

/** A paid subscription (entry or pro) — distinct from the trial/lapsed sentinel. */
function isPaid(user: AuthUser): boolean {
  return user.plan === "entry" || user.plan === "pro";
}

/**
 * Returns the current authenticated user and their org, or null if not signed in.
 *
 * Wrapped in React `cache()` so it executes at most ONCE per server request,
 * even though the (app) layout, the per-surface layout, and the page's
 * requireUser/requireSurface all call it. A single join (not two round-trips)
 * keeps it to one query per request.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();

  if (!clerkUserId || !clerkOrgId) return null;

  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      surfaces: users.surfaces,
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      plan: organizations.plan,
      financeEnabled: organizations.financeEnabled,
      trialEndsAt: organizations.trialEndsAt,
    })
    .from(users)
    .innerJoin(organizations, eq(users.orgId, organizations.id))
    .where(
      and(
        eq(users.clerkUserId, clerkUserId),
        eq(organizations.clerkOrgId, clerkOrgId)
      )
    )
    .limit(1);

  if (!row) return null;

  // Safety net: if the Clerk `organization.created` webhook never stamped a
  // trial (missed/not configured) and the org isn't on a paid plan, start the
  // 7-day trial now. The `IS NULL` guard makes it idempotent + race-safe, so
  // a lapsed org (past trial_ends_at) is never re-granted.
  let trialEndsAt = row.trialEndsAt;
  if (!trialEndsAt && row.plan !== "pro" && row.plan !== "entry") {
    const newEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db
      .update(organizations)
      .set({ trialEndsAt: newEnd, updatedAt: new Date() })
      .where(and(eq(organizations.id, row.orgId), isNull(organizations.trialEndsAt)));
    trialEndsAt = newEnd;
  }

  return {
    userId: row.userId,
    orgId: row.orgId,
    clerkUserId,
    clerkOrgId,
    email: row.email,
    name: row.name,
    role: row.role,
    surfaces: (row.surfaces ?? ["operations"]) as Surface[],
    orgName: row.orgName,
    orgSlug: row.orgSlug,
    plan: row.plan,
    financeEnabled: row.financeEnabled,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
  };
});

/** In an active (not-yet-expired) trial with no paid subscription. The trial is
 * of the ENTRY tier only (Pro/Pro Finance have no trial). */
export function isTrialing(user: AuthUser): boolean {
  return !isPaid(user) && !!user.trialEndsAt && new Date(user.trialEndsAt) > new Date();
}

/** Whole-numbered days left in the trial (0 if expired/none). */
export function trialDaysLeft(user: AuthUser): number {
  if (!user.trialEndsAt) return 0;
  const ms = new Date(user.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Has access to the app: a paid plan (entry/pro) OR an active Entry trial. A
 * lapsed org (trial ended, never subscribed) has no access — no free tier. */
export function hasAppAccess(user: AuthUser): boolean {
  return isPaid(user) || isTrialing(user);
}

/** Whether the user can access a given surface (admins always can). */
export function hasSurface(user: AuthUser, surface: Surface): boolean {
  return user.role === "admin" || user.surfaces.includes(surface);
}

/**
 * Finance access requires BOTH the finance surface (per-user) AND the org's
 * Pro Finance add-on (per-org billing). A finance-surface user on a non-finance
 * plan sees the upsell, not the data.
 */
export function hasFinanceAccess(user: AuthUser): boolean {
  // Pro Finance is a PAID add-on with NO trial — the 7-day trial covers the
  // lowest tier (Pro) only. So finance requires the purchased add-on, even
  // during the trial.
  return hasSurface(user, "finance") && user.financeEnabled;
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

/**
 * Returns the current user if they can access `surface`, else throws.
 * Used by per-surface layouts to gate forbidden access.
 */
export async function requireSurface(surface: Surface): Promise<AuthUser> {
  const user = await requireUser();
  if (!hasSurface(user, surface)) {
    throw new Error(`Forbidden: ${surface} surface not accessible`);
  }
  return user;
}
