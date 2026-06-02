import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getAccrualsView } from "./actions";
import { AccrualsClient } from "./accruals-client";

export default async function AccrualsPage() {
  await requireSurface("finance");
  const view = await getAccrualsView();
  return (
    <div>
      <PageHead
        title="Accruals"
        sub="Generate the month-end accrual — coded usage split by GL × cost center, plus the forecast tail — as a balanced draft journal entry. Review and approve; nothing posts externally."
      />
      <AccrualsClient view={view} />
    </div>
  );
}
