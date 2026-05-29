import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { PaymentBanner } from "@/components/payment-banner";
import { db } from "@/lib/db/client";
import { organizations, anomalies } from "@/lib/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";
import { withOrgContext } from "@/lib/db/rls";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [org] = await db
    .select({ paymentStatus: organizations.paymentStatus })
    .from(organizations)
    .where(eq(organizations.id, user.orgId))
    .limit(1);

  const isPastDue = org?.paymentStatus === "past_due";

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
      <Sidebar className="hidden lg:flex" unackCount={Number(unackCount)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {isPastDue && <PaymentBanner />}
        <TopBar user={user} unackCount={Number(unackCount)} />
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
