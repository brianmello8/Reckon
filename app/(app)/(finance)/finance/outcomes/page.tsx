import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getOutcomesView } from "./actions";
import { OutcomesClient } from "./outcomes-client";

export default async function OutcomesPage() {
  await requireSurface("finance");
  const view = await getOutcomesView();
  return (
    <div>
      <PageHead
        title="Outcomes"
        sub="Feed in the numerators — revenue, tickets closed, docs processed — so AI cost can be divided into a unit economic. Reckon supplies the cost; you supply the outcome (manual, CSV, or API)."
      />
      <OutcomesClient view={view} />
    </div>
  );
}
