import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getDimensions } from "./actions";
import { DimensionsClient } from "./dimensions-client";

export default async function DimensionsPage() {
  await requireSurface("finance");
  const d = await getDimensions();
  return (
    <div>
      <PageHead
        title="Dimensions"
        sub="Cost centers, GL accounts, projects, entities, and product lines — the finance master data every dollar rolls up to."
      />
      <DimensionsClient
        costCenters={d.costCenters}
        glAccounts={d.glAccounts}
        projects={d.projects}
        entities={d.entities}
        productLines={d.productLines}
      />
    </div>
  );
}
