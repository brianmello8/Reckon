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
} from "lucide-react";
import { Logo } from "@/components/reckon/primitives";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/developers", label: "Developers", icon: Users },
  { href: "/providers", label: "Providers", icon: Key },
  { href: "/anomalies", label: "Anomalies", icon: AlertTriangle, badge: true },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export function Sidebar({
  className,
  unackCount = 0,
}: {
  className?: string;
  unackCount?: number;
}) {
  const pathname = usePathname();

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

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
        })}
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
