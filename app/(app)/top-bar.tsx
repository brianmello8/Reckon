"use client";

import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { Search, Bell } from "lucide-react";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "@/components/reckon/theme-toggle";
import type { AuthUser } from "@/lib/auth";

export function TopBar({
  user,
  unackCount = 0,
}: {
  user: AuthUser;
  unackCount?: number;
}) {
  return (
    <header
      className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center justify-between border-b border-line px-4 backdrop-blur lg:px-[26px]"
      style={{ background: "color-mix(in oklab, var(--paper) 82%, transparent)" }}
    >
      <div className="flex items-center gap-2">
        <MobileNav unackCount={unackCount} />
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "flex items-center",
              organizationSwitcherTrigger: "px-2 py-1 rounded-md hover:bg-bg-2",
            },
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Search"
          className="inline-flex h-[30px] w-[34px] items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink"
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          title="Notifications"
          className="relative inline-flex h-[30px] w-[34px] items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink"
        >
          <Bell size={16} />
          {unackCount > 0 && (
            <span className="absolute right-[7px] top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
          )}
        </button>
        <ThemeToggle />
        <div className="mx-1 h-[22px] w-px bg-line" />
        <UserButton />
      </div>
    </header>
  );
}
