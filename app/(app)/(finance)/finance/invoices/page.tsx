import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { providers } from "@/lib/db/schema";
import { getInvoices } from "./actions";
import { InvoicesClient } from "./invoices-client";

export default async function InvoicesPage() {
  await requireSurface("finance");
  const [invoices, providerRows] = await Promise.all([
    getInvoices(),
    db.select({ key: providers.key, name: providers.displayName }).from(providers).orderBy(providers.displayName),
  ]);

  return (
    <div>
      <PageHead
        title="Invoices"
        sub="Capture provider invoices (manual or billing-API) so reconciliation can verify them against observed usage. Enter expected credits when you know what was promised."
      />
      <InvoicesClient
        providers={providerRows}
        invoices={invoices.map((i) => ({
          id: i.id,
          provider: i.provider,
          invoiceNumber: i.invoiceNumber,
          billingPeriodStart: i.billingPeriodStart,
          billingPeriodEnd: i.billingPeriodEnd,
          currency: i.currency,
          subtotal: i.subtotal.toString(),
          creditsApplied: i.creditsApplied.toString(),
          expectedCredits: i.expectedCredits != null ? i.expectedCredits.toString() : null,
          expectedCreditsSource: i.expectedCreditsSource,
          tax: i.tax.toString(),
          total: i.total.toString(),
          status: i.status,
          source: i.source,
          rateCheckable: i.rateCheckable,
        }))}
      />
    </div>
  );
}
