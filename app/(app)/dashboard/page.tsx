import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Verify org data is accessible through RLS
  const org = await withOrgContext(user.orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
    return rows[0];
  });

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.name}.
        </h1>
        <p className="mt-2 text-zinc-600">
          You are in org <span className="font-medium">{org?.name ?? user.orgName}</span>.
        </p>
      </div>
    </div>
  );
}
