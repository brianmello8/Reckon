import Link from "next/link";
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
      <div className="rounded-xl border border-line bg-paper p-6">
        <p className="text-sm font-medium text-ink">Start with your dimensions</p>
        <p className="mt-1 max-w-md text-sm text-zinc-500">
          Set up cost centers, GL accounts, projects, entities, and product
          lines on the{" "}
          <Link href="/finance/dimensions" className="font-medium text-ink underline">
            Dimensions
          </Link>{" "}
          page. Showback, budgets, reconciliation, accruals, and unit economics
          build on this master data across Phases 9–13.
        </p>
      </div>
    </div>
  );
}
