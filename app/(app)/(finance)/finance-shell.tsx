"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Landmark, Tags, FolderTree, ListTree, FileText, Scale, Wallet,
  TrendingUp, BookText, CalendarClock, FileDown, Gauge, Target,
} from "lucide-react";

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> };

// Finance grouped into the four close stages (design handoff).
const FIN_NAV: { group: string; items: Item[] }[] = [
  { group: "Allocate", items: [
    { href: "/finance", label: "Finance", icon: Landmark },
    { href: "/finance/coding", label: "Coding", icon: Tags },
    { href: "/finance/dimensions", label: "Dimensions", icon: FolderTree },
    { href: "/finance/erp-codes", label: "ERP codes", icon: ListTree },
  ] },
  { group: "Verify", items: [
    { href: "/finance/invoices", label: "Invoices", icon: FileText },
    { href: "/finance/reconciliation", label: "Reconciliation", icon: Scale },
    { href: "/finance/commitments", label: "Commitments", icon: Wallet },
    { href: "/finance/forecast", label: "Forecast", icon: TrendingUp },
  ] },
  { group: "Close", items: [
    { href: "/finance/accruals", label: "Accruals", icon: BookText },
    { href: "/finance/periods", label: "Periods", icon: CalendarClock },
    { href: "/finance/export", label: "Export", icon: FileDown },
  ] },
  { group: "Analyze", items: [
    { href: "/finance/unit-economics", label: "Unit economics", icon: Gauge },
    { href: "/finance/outcomes", label: "Outcomes", icon: Target },
  ] },
];
const ALL = FIN_NAV.flatMap((g) => g.items);

export function FinanceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const railLink = (it: Item, compact = false) => {
    const on = pathname === it.href;
    const Icon = it.icon;
    return (
      <Link
        key={it.href}
        href={it.href}
        prefetch={false}
        className={cn(
          "relative flex items-center gap-[10px] rounded-[8px] px-[10px] py-[7px] text-[13px] font-medium transition-colors",
          compact && "shrink-0",
          on ? "bg-bg-2 text-ink" : "text-ink-3 hover:bg-bg-2 hover:text-ink"
        )}
      >
        {on && !compact && <span className="absolute -left-2.5 bottom-2 top-2 w-[3px] rounded-[3px] bg-brand" />}
        <Icon size={15} strokeWidth={on ? 2.1 : 1.8} className={on ? "text-brand" : "text-ink-3"} />
        {it.label}
      </Link>
    );
  };

  return (
    <div>
      {/* Mobile rail: horizontal pills */}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1 lg:hidden">{ALL.map((it) => railLink(it, true))}</div>

      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-7">
        <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
          <span className="mb-3 inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand-ink">
            Pro Finance
          </span>
          <nav className="flex flex-col gap-4">
            {FIN_NAV.map((sec) => (
              <div key={sec.group}>
                <div className="px-[10px] pb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3/70">{sec.group}</div>
                <div className="flex flex-col gap-px">{sec.items.map((it) => railLink(it))}</div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
