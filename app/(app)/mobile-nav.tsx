"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";

export function MobileNav({ unackCount = 0 }: { unackCount?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="p-2 text-ink-2 hover:text-ink lg:hidden">
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open navigation</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[232px] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Sidebar className="flex h-full" unackCount={unackCount} />
      </SheetContent>
    </Sheet>
  );
}
