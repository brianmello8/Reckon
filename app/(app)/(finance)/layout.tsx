import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasSurface, hasFinanceAccess } from "@/lib/auth";
import { Landmark } from "lucide-react";
import { FinanceShell } from "./finance-shell";

/**
 * Gate the Finance surface. 404 for members without the finance surface;
 * an upgrade prompt for finance-surface users whose org isn't on Pro Finance
 * (the finance add-on, billing-level). Data is never rendered without both.
 */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !hasSurface(user, "finance")) notFound();

  if (!hasFinanceAccess(user)) {
    return (
      <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-line bg-paper p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-2">
          <Landmark size={22} className="text-ink-2" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink">Finance is part of Pro Finance</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
          Cost allocation, invoice reconciliation, forecasting, month-end accruals, unit economics,
          and GL-ready export &amp; ERP mapping. Add it to your plan to turn AI spend into close-ready
          financials.
        </p>
        {user.role === "admin" ? (
          <Link
            href="/billing"
            className="mt-5 inline-flex h-9 items-center rounded-md bg-ink px-4 text-[13.5px] font-medium text-paper hover:opacity-90"
          >
            Add Pro Finance
          </Link>
        ) : (
          <p className="mt-5 text-[12.5px] text-ink-3">Ask an admin to enable Pro Finance on the billing page.</p>
        )}
      </div>
    );
  }

  return <FinanceShell>{children}</FinanceShell>;
}
