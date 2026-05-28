import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { PaymentBanner } from "@/components/payment-banner";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar className="hidden lg:flex" />

      <div className="flex flex-1 flex-col overflow-hidden">
        {isPastDue && <PaymentBanner />}
        <TopBar user={user} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  );
}
