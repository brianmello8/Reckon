import { getBillingData } from "./actions";
import { BillingClient } from "./billing-client";

export default async function BillingPage() {
  const data = await getBillingData();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Manage your subscription and billing details.
      </p>

      <div className="mt-6">
        <BillingClient data={data} />
      </div>
    </div>
  );
}
