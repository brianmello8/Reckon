import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getPeriodsView } from "./actions";
import { PeriodsClient } from "./periods-client";

export default async function PeriodsPage() {
  await requireSurface("finance");
  const view = await getPeriodsView();
  return (
    <div>
      <PageHead
        title="Periods"
        sub="Open, close, and lock accounting periods. Usage is attributed to a period by its reporting-timezone cutoff (not raw UTC), so late-month spend lands in the right month."
      />
      <PeriodsClient view={view} />
    </div>
  );
}
