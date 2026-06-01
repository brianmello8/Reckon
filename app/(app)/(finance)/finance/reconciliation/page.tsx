import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getReconciliations, getReconcilableInvoices } from "./actions";
import { ReconciliationClient } from "./reconciliation-client";

export default async function ReconciliationPage() {
  await requireSurface("finance");
  const [recons, invoices] = await Promise.all([
    getReconciliations(),
    getReconcilableInvoices(),
  ]);
  return (
    <div>
      <PageHead
        title="Reconciliation"
        sub="Verify each provider invoice against observed usage and explain every dollar of the difference. An honest 'unknown' always beats a forced explanation."
      />
      <ReconciliationClient reconciliations={recons} invoices={invoices} />
    </div>
  );
}
