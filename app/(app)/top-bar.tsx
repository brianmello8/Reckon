"use client";

import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { MobileNav } from "./mobile-nav";
import type { AuthUser } from "@/lib/auth";

export function TopBar({ user }: { user: AuthUser }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4">
      <div className="flex items-center gap-3">
        <MobileNav />
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-zinc-600 sm:block">
          {user.email}
        </span>
        <UserButton />
      </div>
    </header>
  );
}
