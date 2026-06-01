import { PageHead } from "@/components/reckon/page-head";
import { requireAdmin } from "@/lib/auth";
import { getMembers } from "./actions";
import { MembersClient } from "./members-client";

export default async function MembersPage() {
  await requireAdmin();
  const members = await getMembers();
  return (
    <div>
      <PageHead
        title="Members"
        sub="Control which surfaces each member can access. Admins always have access to all surfaces."
      />
      <MembersClient
        members={members.map((m) => ({ ...m, surfaces: m.surfaces ?? [] }))}
      />
    </div>
  );
}
