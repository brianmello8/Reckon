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
  "All providers (Anthropic, OpenAI, Copilot, OpenRouter)",
  "Workflows & per-agent ROI",
  "Observability connectors (Langfuse / Helicone)",
  "Daily + weekly digests, anomaly alerts",
  "Linear integration",
  "365-day data retention",
];

const FINANCE_FEATURES = [
  "Everything in Pro",
  "Cost allocation, GL coding & dimensions",
  "Invoice ingestion + reconciliation",
  "Forecasting & commitment tracking",
  "Month-end accruals, reversals & true-ups",
  "Unit economics, margin alerts & GL export",
];

export function PricingClient() {
  const [annual, setAnnual] = useState(false);

  const perSeat = annual ? 80 : 8; // $/seat/yr or /mo
  const seatUnit = annual ? "/seat/yr" : "/seat/mo";
  const finance = annual ? 4990 : 499; // flat add-on
  const financeUnit = annual ? "/yr" : "/mo";

  return (
    <div className="mt-12">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => setAnnual(false)} className={`text-sm font-medium ${!annual ? "text-ink" : "text-ink-4"}`}>
          Monthly
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual(!annual)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${annual ? "bg-brand" : "bg-line-2"}`}
          aria-label="Toggle annual billing"
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${annual ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <button onClick={() => setAnnual(true)} className={`text-sm font-medium ${annual ? "text-ink" : "text-ink-4"}`}>
          Annual <span className="text-pos">(save ~17%)</span>
        </button>
      </div>

      {/* Plan cards */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {/* Free */}
        <div className="rounded-xl border border-line bg-paper p-8 shadow-sm">
          <h3 className="text-lg font-medium text-ink">Free</h3>
          <p className="mt-4 text-4xl font-semibold text-ink">$0</p>
          <p className="mt-1 text-sm text-ink-3">For small teams getting started</p>
          <ul className="mt-6 space-y-3">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-ink-2"><Check className="h-4 w-4 text-ink-4" />{f}</li>
            ))}
          </ul>
          <div className="mt-8">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="w-full rounded-lg border border-line-2 px-4 py-2 text-sm font-medium text-ink hover:bg-bg-2">Start free</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className="block w-full rounded-lg border border-line-2 px-4 py-2 text-center text-sm font-medium text-ink hover:bg-bg-2">Go to dashboard</Link>
            </Show>
          </div>
        </div>

        {/* Pro */}
        <div className="rounded-xl border-2 border-brand bg-paper p-8 shadow-sm">
          <h3 className="text-lg font-medium text-ink">Pro</h3>
          <p className="mt-4 text-4xl font-semibold text-ink">
            ${perSeat}<span className="text-base font-normal text-ink-3">{seatUnit}</span>
          </p>
          <p className="mt-1 text-sm text-ink-3">1 seat = 1 tracked developer · min 3 · pick any number</p>
          <ul className="mt-6 space-y-3">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-ink-2"><Check className="h-4 w-4 text-ink" />{f}</li>
            ))}
          </ul>
          <div className="mt-8">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">Start free, upgrade anytime</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/billing" className="block w-full rounded-lg bg-brand px-4 py-2 text-center text-sm font-medium text-white hover:opacity-90">Upgrade to Pro</Link>
            </Show>
          </div>
        </div>

        {/* Pro Finance */}
        <div className="rounded-xl border border-line bg-paper p-8 shadow-sm">
          <h3 className="text-lg font-medium text-ink">Pro Finance</h3>
          <p className="mt-4 text-4xl font-semibold text-ink">
            Pro + ${finance.toLocaleString()}<span className="text-base font-normal text-ink-3">{financeUnit}</span>
          </p>
          <p className="mt-1 text-sm text-ink-3">Flat, org-wide. Turn AI spend into close-ready financials.</p>
          <ul className="mt-6 space-y-3">
            {FINANCE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-ink-2"><Check className="h-4 w-4 text-brand" />{f}</li>
            ))}
          </ul>
          <div className="mt-8">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="w-full rounded-lg border border-line-2 px-4 py-2 text-sm font-medium text-ink hover:bg-bg-2">Start free</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/billing" className="block w-full rounded-lg border border-line-2 px-4 py-2 text-center text-sm font-medium text-ink hover:bg-bg-2">Add Pro Finance</Link>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
