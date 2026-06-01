import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";

export default async function FinancePage() {
  await requireSurface("finance");
  return (
    <div>
      <PageHead
        title="Finance"
        sub="Showback, dimensions, reconciliation, accruals, and unit economics."
      />
      <div className="rounded-xl border border-dashed border-line bg-paper p-10 text-center">
        <p className="text-sm font-medium text-ink">Coming soon</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
          The Finance surface (cost centers, GL accounts, budgets, invoice
          reconciliation, accruals, and unit economics) lands in Phase 9.
        </p>
      </div>
    </div>
  );
}
