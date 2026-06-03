import { getBillingData } from "./actions";
import { BillingClient } from "./billing-client";

export default async function BillingPage() {
  let data: Awaited<ReturnType<typeof getBillingData>> | null = null;
  let error = false;
  try {
    data = await getBillingData();
  } catch (e) {
    // Never white-screen the route on a billing/Stripe hiccup — render a fallback.
    console.error("[billing] getBillingData failed:", e);
    error = true;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Manage your subscription and billing details.
      </p>

      <div className="mt-6">
        {data ? (
          <BillingClient data={data} />
        ) : (
          <div className="max-w-md rounded-xl border border-line bg-paper p-6">
            <p className="text-[14px] font-medium text-ink">Billing is temporarily unavailable</p>
            <p className="mt-1 text-[13px] text-ink-3">
              {error
                ? "We couldn't load your subscription right now. Please try again in a moment — if it persists, the billing configuration may need attention."
                : "No billing data."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
