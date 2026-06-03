import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, hasAppAccess, isTrialing, trialDaysLeft } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { PaymentBanner } from "@/components/payment-banner";
import { TrialBanner } from "@/components/trial-banner";
import { Paywall } from "./paywall";
import { getBillingData } from "./billing/actions";
import { db } from "@/lib/db/client";
import { organizations, anomalies } from "@/lib/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";
import { withOrgContext } from "@/lib/db/rls";
import type { Metadata } from "next";

// The authenticated app is private — keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Distinguish "not signed in" (→ sign-in) from "signed in but no active org"
  // (→ onboarding) to avoid a sign-in redirect loop for new users.
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");

  const user = await getCurrentUser();
  if (!user) redirect("/onboarding");

  const [org] = await db
    .select({ paymentStatus: organizations.paymentStatus })
    .from(organizations)
    .where(eq(organizations.id, user.orgId))
    .limit(1);

  const isPastDue = org?.paymentStatus === "past_due";
  const isAdmin = user.role === "admin";

  // No free tier: a lapsed org (trial ended, never subscribed) hits a paywall.
  if (!hasAppAccess(user)) {
    const billing = isAdmin ? await getBillingData().catch(() => null) : null;
    return <Paywall isAdmin={isAdmin} billing={billing} />;
  }
  const trialing = isTrialing(user);

  // Surfaces this member can see in nav (admins get all three).
  const surfaces = isAdmin
    ? (["operations", "workflows", "finance"] as const).slice()
    : user.surfaces;
  // Pro Finance is paid-only (no trial). During the trial the finance nav shows
  // its PRO upsell pill rather than unlocking.
  const financeEnabled = user.financeEnabled;

  // Unacknowledged anomaly count for the nav badge.
  const [{ value: unackCount } = { value: 0 }] = await withOrgContext(
    user.orgId,
    async (tx) =>
      tx
        .select({ value: count(anomalies.id) })
        .from(anomalies)
        .where(
          and(
            eq(anomalies.orgId, user.orgId),
            isNull(anomalies.acknowledgedAt)
          )
        )
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg-warm">
      <Sidebar
        className="hidden lg:flex"
        unackCount={Number(unackCount)}
        surfaces={surfaces}
        isAdmin={isAdmin}
        financeEnabled={financeEnabled}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {isPastDue && <PaymentBanner />}
        {trialing && <TrialBanner daysLeft={trialDaysLeft(user)} />}
        <TopBar
          user={user}
          unackCount={Number(unackCount)}
          surfaces={surfaces}
          isAdmin={isAdmin}
          financeEnabled={financeEnabled}
        />
        <main className="flex-1 overflow-y-auto bg-bg-warm">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-7 lg:px-[26px] fade-up">
            {children}
          </div>
        </main>
      </div>

      <Toaster />
    </div>
  );
}
