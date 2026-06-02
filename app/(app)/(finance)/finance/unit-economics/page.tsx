import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getUnitEconomicsView } from "./actions";
import { UnitEconomicsClient } from "./unit-economics-client";

export default async function UnitEconomicsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireSurface("finance");
  const view = await getUnitEconomicsView((await searchParams).period);
  return (
    <div>
      <PageHead
        title="Unit economics"
        sub="Is the AI spend worth it? Cost per unit, AI COGS as a share of revenue, and gross margin — Reckon's cost divided by the outcomes you supply. Cost figures reconcile to underlying usage."
      />
      <UnitEconomicsClient view={view} />
    </div>
  );
}
