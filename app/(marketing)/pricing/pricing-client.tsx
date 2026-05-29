"use client";

import { useState } from "react";
import Link from "next/link";
import { SignUpButton, Show } from "@clerk/nextjs";
import { Check } from "lucide-react";

const FREE_FEATURES = [
  "Up to 3 developers",
  "1 provider (Anthropic or OpenAI)",
  "Daily Slack digest",
  "Anomaly detection",
  "30-day data retention",
];

const PRO_FEATURES = [
  "Unlimited developers",
  "All providers (Anthropic, OpenAI, Copilot)",
  "Daily and weekly digests",
  "Anomaly alerts with Slack acknowledge",
  "Linear integration for critical anomalies",
  "365-day data retention",
];

export function PricingClient() {
  const [annual, setAnnual] = useState(false);

  const monthlyPerDev = 19;
  const annualPerDevPerMonth = 190 / 12; // $15.83
  const perDev = annual ? annualPerDevPerMonth : monthlyPerDev;
  const minimum = annual ? 990 : 99; // 6 devs floor

  return (
    <div className="mt-12">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setAnnual(false)}
          className={`text-sm font-medium ${!annual ? "text-zinc-900" : "text-zinc-400"}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setAnnual(!annual)}
          className="relative h-6 w-11 rounded-full bg-zinc-900 transition-colors"
          aria-label="Toggle annual billing"
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              annual ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <button
          onClick={() => setAnnual(true)}
          className={`text-sm font-medium ${annual ? "text-zinc-900" : "text-zinc-400"}`}
        >
          Annual <span className="text-green-600">(save 17%)</span>
        </button>
      </div>

      {/* Plan cards */}
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="rounded-lg border p-8">
          <h3 className="text-lg font-medium">Free</h3>
          <p className="mt-4 text-4xl font-semibold">$0</p>
          <p className="mt-1 text-sm text-zinc-500">For small teams getting started</p>
          <ul className="mt-6 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-zinc-600">
                <Check className="h-4 w-4 text-zinc-400" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  Start free
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="block w-full rounded-md border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Go to dashboard
              </Link>
            </Show>
          </div>
        </div>

        {/* Pro */}
        <div className="rounded-lg border-2 border-zinc-900 p-8">
          <h3 className="text-lg font-medium">Pro</h3>
          <p className="mt-4 text-4xl font-semibold">
            ${perDev.toFixed(annual ? 2 : 0)}
            <span className="text-base font-normal text-zinc-500">/dev/mo</span>
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            ${minimum}/{annual ? "yr" : "mo"} minimum
            {annual ? " · billed annually" : ""}
          </p>
          <ul className="mt-6 space-y-3">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-zinc-900" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                  Start free, upgrade anytime
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/billing"
                className="block w-full rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800"
              >
                Upgrade to Pro
              </Link>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
