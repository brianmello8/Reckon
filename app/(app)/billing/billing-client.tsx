"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { createCheckoutSession, createPortalSession } from "./actions";

type BillingData = {
  plan: string;
  paymentStatus: string | null;
  developerCount: number;
  providerCount: number;
  seatCount: number | null;
  financeEnabled: boolean;
  minSeats: number;
  subscription: {
    status: string;
    currentPeriodEnd: string;
    interval: string;
    seats: number;
    seatUnitAmount: number; // cents
    financeAmount: number; // cents
    totalAmount: number; // cents
  } | null;
};

// Display prices — MUST match the Stripe Prices configured in env.
const PRICE = {
  proSeatMonthly: 8, // $/seat/mo
  proSeatAnnual: 80, // $/seat/yr
  financeMonthly: 499, // $/mo flat
  financeAnnual: 4990, // $/yr flat
};

const PRO_FEATURES = [
  "All providers (Anthropic, OpenAI, Copilot, OpenRouter)",
  "Workflows & per-agent ROI",
  "Observability connectors (Langfuse/Helicone)",
  "Daily + weekly digests, anomaly alerts",
  "Linear integration",
  "365-day retention",
];
const FINANCE_FEATURES = [
  "Cost centers, GL accounts, allocation & coding",
  "Invoice ingestion + reconciliation",
  "Forecasting & commitment tracking",
  "Month-end accruals, reversals & true-ups",
  "Unit economics & margin alerts",
  "GL-ready export + ERP code mapping",
];
const FREE_FEATURES = ["Up to 3 developers", "1 provider", "Daily digest only", "30-day retention"];

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function BillingClient({ data }: { data: BillingData }) {
  const searchParams = useSearchParams();
  const [pending, setPending] = React.useState(false);
  const [interval, setInterval] = React.useState<"month" | "year">("month");
  const [seats, setSeats] = React.useState<number>(Math.max(data.minSeats, data.developerCount || 0));

  React.useEffect(() => {
    if (searchParams.get("success")) toast.success("Subscription activated!");
    if (searchParams.get("canceled")) toast("Checkout canceled.");
  }, [searchParams]);

  async function subscribe(withFinance: boolean) {
    setPending(true);
    try {
      await createCheckoutSession({ interval, seats: Math.max(data.minSeats, seats), finance: withFinance });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
      setPending(false);
    }
  }
  async function manage() {
    setPending(true);
    try {
      await createPortalSession();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open portal");
      setPending(false);
    }
  }

  const seatTotal = interval === "year" ? seats * PRICE.proSeatAnnual : seats * PRICE.proSeatMonthly;
  const finFlat = interval === "year" ? PRICE.financeAnnual : PRICE.financeMonthly;
  const per = interval === "year" ? "/yr" : "/mo";

  // ── Active subscriber view ─────────────────────────────────────────────────
  if (data.plan === "pro" && data.subscription) {
    const sub = data.subscription;
    const overSeats = data.developerCount > sub.seats;
    return (
      <div className="max-w-lg space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{data.financeEnabled ? "Reckon Pro Finance" : "Reckon Pro"}</CardTitle>
              <Badge>{sub.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Seats (purchased)" value={String(sub.seats)} />
              <Field label="Seats used" value={`${data.developerCount} of ${sub.seats}`} />
              <Field label="Finance add-on" value={data.financeEnabled ? "On" : "Off"} />
              <Field label="Billing" value={`${money(sub.totalAmount)}${sub.interval === "year" ? "/yr" : "/mo"}`} />
              <Field label="Renews" value={new Date(sub.currentPeriodEnd).toLocaleDateString()} />
              <Field label="Per seat" value={`${money(sub.seatUnitAmount)}`} />
            </div>
            {overSeats && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-700">
                You&apos;re tracking {data.developerCount} developers but purchased {sub.seats} seats. Add seats in the billing portal.
              </p>
            )}
            <Button onClick={manage} disabled={pending} variant="outline" className="w-full">
              {pending ? "Opening…" : "Manage billing & seats"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Plan picker (free / not subscribed) ────────────────────────────────────
  return (
    <div className="max-w-3xl space-y-6">
      {/* Interval toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] text-ink-3">Billing</span>
        {(["month", "year"] as const).map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${interval === iv ? "bg-ink text-paper" : "text-ink-3 hover:bg-bg-2"}`}
          >
            {iv === "month" ? "Monthly" : "Annual (save ~17%)"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {/* Free */}
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <p className="text-2xl font-semibold">$0</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-ink-3"><Check className="h-4 w-4 text-ink-3" />{f}</li>
              ))}
            </ul>
            {data.plan === "free" && <Badge variant="secondary" className="mt-4">Current plan</Badge>}
          </CardContent>
        </Card>

        {/* Pro */}
        <Card className="border-ink">
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <p className="text-2xl font-semibold">
              ${interval === "year" ? PRICE.proSeatAnnual : PRICE.proSeatMonthly}
              <span className="text-sm font-normal text-ink-3">/seat{per}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-ink" />{f}</li>
              ))}
            </ul>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              Seats
              <Input
                type="number"
                min={data.minSeats}
                value={seats}
                onChange={(e) => setSeats(Math.max(data.minSeats, Number(e.target.value) || data.minSeats))}
                className="w-20"
              />
              <span className="text-ink-3">min {data.minSeats}</span>
            </label>
            <p className="text-[12.5px] text-ink-3">{money(seatTotal * 100)}{per} · you can change seats anytime</p>
            <Button onClick={() => subscribe(false)} disabled={pending} className="w-full">
              {pending ? "Loading…" : "Subscribe to Pro"}
            </Button>
          </CardContent>
        </Card>

        {/* Pro Finance */}
        <Card className="border-brand">
          <CardHeader>
            <CardTitle>Pro Finance</CardTitle>
            <p className="text-2xl font-semibold">
              Pro + ${finFlat.toLocaleString()}
              <span className="text-sm font-normal text-ink-3">{per} flat</span>
            </p>
            <p className="text-xs text-ink-3">finance suite, org-wide</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {FINANCE_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-brand" />{f}</li>
              ))}
            </ul>
            <p className="text-[12.5px] text-ink-3">{money((seatTotal + finFlat) * 100)}{per} ({seats} seats + finance)</p>
            <Button onClick={() => subscribe(true)} disabled={pending} className="w-full">
              {pending ? "Loading…" : "Subscribe to Pro Finance"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-3">{label}</p>
      <p className="font-medium text-ink">{value}</p>
    </div>
  );
}
