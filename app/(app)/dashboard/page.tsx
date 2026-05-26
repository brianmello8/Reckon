import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-zinc-600">
        Welcome, {user.name}. You are in org{" "}
        <span className="font-medium">{user.orgName}</span>.
      </p>
    </div>
  );
}
