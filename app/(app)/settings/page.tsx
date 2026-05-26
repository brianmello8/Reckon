import { requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();

  const org = await withOrgContext(user.orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
    return rows[0];
  });

  if (!org) throw new Error("Organization not found");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-zinc-600">Manage your organization settings.</p>

      <div className="mt-8 max-w-lg">
        <SettingsForm
          orgName={org.name}
          digestTimeLocal={org.digestTimeLocal}
          digestTimezone={org.digestTimezone}
          isAdmin={user.role === "admin"}
        />
      </div>
    </div>
  );
}
