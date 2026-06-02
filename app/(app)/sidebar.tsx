"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Key,
  AlertTriangle,
  Plug,
  Settings,
  CreditCard,
  Activity,
  Workflow,
  Landmark,
  FolderTree,
  Tags,
  FileText,
  Scale,
  TrendingUp,
  Wallet,
  CalendarClock,
  BookText,
  Target,
  Gauge,
  FileDown,
  ListTree,
  UserCog,
} from "lucide-react";
import { Logo } from "@/components/reckon/primitives";

type Surface = "operations" | "workflows" | "finance";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: boolean;
  exact?: boolean; // active only on exact match (for prefix-overlapping routes)
};

const SURFACE_NAV: Record<Surface, NavItem[]> = {
  operations: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/developers", label: "Developers", icon: Users },
    { href: "/providers", label: "Providers", icon: Key },
    { href: "/observability", label: "Observability", icon: Activity },
    { href: "/anomalies", label: "Anomalies", icon: AlertTriangle, badge: true },
    { href: "/integrations", label: "Integrations", icon: Plug },
  ],
  workflows: [{ href: "/workflows", label: "Workflows", icon: Workflow }],
  finance: [
    { href: "/finance", label: "Finance", icon: Landmark, exact: true },
    { href: "/finance/dimensions", label: "Dimensions", icon: FolderTree },
    { href: "/finance/coding", label: "Coding", icon: Tags },
    { href: "/finance/invoices", label: "Invoices", icon: FileText },
    { href: "/finance/reconciliation", label: "Reconciliation", icon: Scale },
    { href: "/finance/forecast", label: "Forecast", icon: TrendingUp },
    { href: "/finance/commitments", label: "Commitments", icon: Wallet },
    { href: "/finance/periods", label: "Periods", icon: CalendarClock },
    { href: "/finance/accruals", label: "Accruals", icon: BookText },
    { href: "/finance/outcomes", label: "Outcomes", icon: Target },
    { href: "/finance/unit-economics", label: "Unit economics", icon: Gauge },
    { href: "/finance/erp-codes", label: "ERP codes", icon: ListTree },
    { href: "/finance/export", label: "Export", icon: FileDown },
  ],
};

export function Sidebar({
  className,
  unackCount = 0,
  surfaces = ["operations"],
  isAdmin = false,
  financeEnabled = false,
}: {
  className?: string;
  unackCount?: number;
  surfaces?: Surface[];
  isAdmin?: boolean;
  financeEnabled?: boolean;
}) {
  const pathname = usePathname();

  // Only show surfaces the member can access, in a stable order. Finance shows
  // only when the Pro Finance add-on is on (admins always see it → upgrade funnel).
  const order: Surface[] = ["operations", "workflows", "finance"];
  const visible = order.filter(
    (s) => surfaces.includes(s) && (s !== "finance" || financeEnabled || isAdmin)
  );

  const accountItems: NavItem[] = [
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/billing", label: "Billing", icon: CreditCard },
    ...(isAdmin
      ? [{ href: "/members", label: "Members", icon: UserCog }]
      : []),
  ];

  const renderItem = (item: NavItem) => {
    const active = item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        className={cn(
          "relative flex items-center gap-[11px] rounded-[9px] px-[11px] py-2 text-[13.5px] font-medium transition-colors",
          active
            ? "bg-bg-2 text-ink"
            : "text-ink-3 hover:bg-bg-2 hover:text-ink"
        )}
      >
        {active && (
          <span className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-[3px] bg-brand" />
        )}
        <Icon size={17} strokeWidth={active ? 2.2 : 1.9} />
        {item.label}
        {item.badge && unackCount > 0 && (
          <span className="mono ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
            {unackCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "w-[232px] shrink-0 flex-col border-r border-line bg-paper",
        className
      )}
    >
      <div className="flex h-[60px] items-center border-b border-line px-[18px]">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {visible.map((surface, i) => (
          <div key={surface} className={cn(i > 0 && "mt-3")}>
            {visible.length > 1 && (
              <div className="px-[11px] pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3/70">
                {surface}
              </div>
            )}
            {SURFACE_NAV[surface].map(renderItem)}
          </div>
        ))}

        <div className="mt-3">
          <div className="px-[11px] pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3/70">
            Account
          </div>
          {accountItems.map(renderItem)}
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-xl border border-line bg-bg-2 p-3">
          <div className="flex items-center gap-2">
            <span className="pulse-dot" />
            <span className="text-[12.5px] font-semibold text-ink">Ingestion live</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
            Polls every hour · keys encrypted at rest
          </p>
        </div>
      </div>
    </aside>
  );
}
