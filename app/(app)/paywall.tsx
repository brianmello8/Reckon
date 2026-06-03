"use client";

import * as React from "react";
import { SignOutButton } from "@clerk/nextjs";
import { Logo } from "@/components/reckon/primitives";
import { BillingClient } from "./billing/billing-client";

type BillingData = React.ComponentProps<typeof BillingClient>["data"];

/** Full-screen wall shown when an org's trial has ended with no active
 * subscription (there is no free tier). Admins get the plan picker inline; other
 * members are told to ask an admin. */
export function Paywall({ isAdmin, billing }: { isAdmin: boolean; billing: BillingData | null }) {
  return (
    <div className="min-h-screen bg-bg-warm">
      <div className="flex h-[60px] items-center justify-between border-b border-line px-5">
        <Logo />
        <SignOutButton>
          <button className="text-[12.5px] text-ink-3 hover:text-ink">Sign out</button>
        </SignOutButton>
      </div>
      <div className="mx-auto max-w-3xl px-5 py-12">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Your free trial has ended</h1>
          <p className="mt-2 text-[14px] text-ink-3">
            Subscribe to keep tracking AI spend. Pick your seats — change them anytime.
          </p>
        </div>
        {isAdmin && billing ? (
          <BillingClient data={billing} />
        ) : (
          <div className="mx-auto max-w-md rounded-xl border border-line bg-paper p-6 text-center">
            <p className="text-[13.5px] text-ink-2">
              Ask an admin on your team to subscribe — they can do it from the billing page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
