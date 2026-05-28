"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { createCheckoutSession, createPortalSession } from "./actions";

type BillingData = {
  plan: string;
  paymentStatus: string | null;
  developerCount: number;
  providerCount: number;
  subscription: {
    status: string;
    currentPeriodEnd: string;
    quantity: number;
    interval: string;
    amount: number;
  } | null;
};

const PRO_FEATURES = [
  "Unlimited developers",
  "All providers (Anthropic, OpenAI, Copilot)",
  "Daily and weekly digests",
  "Anomaly detection with Slack alerts",
  "Linear integration for critical issues",
  "365-day data retention",
];

const FREE_FEATURES = [
  "Up to 3 developers",
  "1 provider",
  "Daily digest only",
  "30-day data retention",
];

export function BillingClient({ data }: { data: BillingData }) {
  const searchParams = useSearchParams();
  const [upgradePending, startUpgrade] = useTransition();
  const [portalPending, startPortal] = useTransition();

  useEffect(() => {
    if (searchParams.get("success")) {
      toast.success("Subscription activated! Welcome to Pro.");
    }
    if (searchParams.get("canceled")) {
      toast("Checkout canceled.");
    }
  }, [searchParams]);

  function handleUpgrade(interval: "month" | "year") {
    startUpgrade(async () => {
      try {
        await createCheckoutSession(interval);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start checkout");
      }
    });
  }

  function handleManage() {
    startPortal(async () => {
      try {
        await createPortalSession();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to open portal");
      }
    });
  }

  if (data.plan === "pro" && data.subscription) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Reckon Pro</CardTitle>
              <Badge>Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-zinc-500">Developers</p>
                <p className="font-medium">{data.subscription.quantity}</p>
              </div>
              <div>
                <p className="text-zinc-500">Billing</p>
                <p className="font-medium">
                  ${(data.subscription.amount / 100).toFixed(2)}/{data.subscription.interval}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Current period ends</p>
                <p className="font-medium">
                  {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Status</p>
                <p className="font-medium capitalize">{data.subscription.status}</p>
              </div>
            </div>

            <Button
              onClick={handleManage}
              disabled={portalPending}
              variant="outline"
              className="w-full"
            >
              {portalPending ? "Opening..." : "Manage billing"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {data.plan === "free" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-zinc-500">Developers</p>
                <p className="font-medium">{data.developerCount} of 3</p>
              </div>
              <div>
                <p className="text-zinc-500">Providers</p>
                <p className="font-medium">{data.providerCount} of 1</p>
              </div>
              <div>
                <p className="text-zinc-500">Retention</p>
                <p className="font-medium">30 days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
      {/* Free plan */}
      <Card>
        <CardHeader>
          <CardTitle>Free</CardTitle>
          <p className="text-2xl font-semibold">$0</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-zinc-600">
                <Check className="h-4 w-4 text-zinc-400" />
                {f}
              </li>
            ))}
          </ul>
          {data.plan === "free" && (
            <Badge variant="secondary" className="mt-4">
              Current plan
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Pro plan */}
      <Card className="border-zinc-900">
        <CardHeader>
          <CardTitle>Pro</CardTitle>
          <div>
            <p className="text-2xl font-semibold">
              $19<span className="text-sm font-normal text-zinc-500">/dev/month</span>
            </p>
            <p className="text-xs text-zinc-500">
              $190/dev/year (save 17%) · $99/mo minimum
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-zinc-900" />
                {f}
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            {data.developerCount} developers tracked · minimum charge for 6 developers
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => handleUpgrade("month")}
              disabled={upgradePending}
              className="flex-1"
            >
              {upgradePending ? "Loading..." : "Monthly"}
            </Button>
            <Button
              onClick={() => handleUpgrade("year")}
              disabled={upgradePending}
              variant="outline"
              className="flex-1"
            >
              {upgradePending ? "Loading..." : "Annual (save 17%)"}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
