import { inngest } from "./client";
import { db } from "@/lib/db/client";
import { organizations, providerKeys, providers } from "@/lib/db/schema";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { decryptSecret } from "@/lib/encryption/envelope";
import { getProviderClient } from "@/lib/providers/registry";
import { captureRateSnapshots } from "@/lib/invoices/rates";
import { upsertInvoice } from "@/lib/invoices/ingest";
import { CRON_MONTHLY_INVOICES } from "./schedule";
import { subDays } from "date-fns";

/**
 * Monthly invoice sync (Phase 10.1): per org, capture a rate snapshot, then
 * pull invoices from any provider that exposes a billing API and upsert them as
 * drafts. Idempotent (upsert by org+provider+invoice_number); never
 * auto-confirms. Providers without an accessible invoices API are skipped.
 */
export const cronMonthlyInvoices = inngest.createFunction(
  { id: "cron-monthly-invoices", triggers: [{ cron: CRON_MONTHLY_INVOICES }] },
  async ({ step }) => {
    const orgs = await step.run("list-active-orgs", async () =>
      db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(isNotNull(organizations.plan), isNull(organizations.deletedAt)))
    );
    if (orgs.length === 0) return { status: "skipped", reason: "no_orgs" };
    await step.run("fan-out", async () => {
      await inngest.send(
        orgs.map((o) => ({ name: "invoices/sync.requested" as const, data: { org_id: o.id } }))
      );
    });
    return { status: "ok", orgs: orgs.length };
  }
);

export const syncInvoicesForOrg = inngest.createFunction(
  { id: "sync-invoices-for-org", retries: 3, triggers: [{ event: "invoices/sync.requested" }] },
  async ({ event, step }) => {
    const { org_id } = event.data as { org_id: string };
    const today = new Date().toISOString().slice(0, 10);

    const snap = await step.run("capture-rates", async () =>
      captureRateSnapshots(org_id, today)
    );

    const invoices = await step.run("sync-billing-api", async () => {
      const keys = await db
        .select({
          id: providerKeys.id,
          providerSlug: providers.key,
          encryptedKey: providerKeys.encryptedKey,
          encryptedDek: providerKeys.encryptedDek,
          iv: providerKeys.iv,
          authTag: providerKeys.authTag,
        })
        .from(providerKeys)
        .innerJoin(providers, eq(providers.id, providerKeys.providerId))
        .where(and(eq(providerKeys.orgId, org_id), eq(providerKeys.status, "active")));

      let upserted = 0;
      for (const k of keys) {
        const client = getProviderClient(k.providerSlug);
        if (!client.fetchInvoices) continue; // provider has no invoices API
        const apiKey = await decryptSecret({
          ciphertext: Buffer.from(k.encryptedKey),
          encryptedDek: Buffer.from(k.encryptedDek),
          iv: Buffer.from(k.iv),
          authTag: Buffer.from(k.authTag),
        });
        const fetched = await client.fetchInvoices({
          apiKey,
          since: subDays(new Date(), 62),
          until: new Date(),
        });
        for (const inv of fetched) {
          await upsertInvoice(
            org_id,
            {
              provider: k.providerSlug,
              invoiceNumber: inv.invoiceNumber,
              billingPeriodStart: inv.billingPeriodStart,
              billingPeriodEnd: inv.billingPeriodEnd,
              currency: inv.currency,
              subtotal: BigInt(inv.subtotal),
              creditsApplied: BigInt(inv.creditsApplied),
              expectedCredits: null, // billing API doesn't know what was promised
              expectedCreditsSource: "none",
              tax: BigInt(inv.tax),
              total: BigInt(inv.total),
              dueDate: inv.dueDate ?? null,
              paymentTerms: inv.paymentTerms ?? null,
              source: "billing_api",
              raw: inv.raw,
              lineItems: inv.lineItems.map((l) => ({
                description: l.description,
                model: l.model ?? null,
                quantity: l.quantity != null ? BigInt(l.quantity) : null,
                unit: l.unit ?? null,
                amount: BigInt(l.amount),
              })),
            },
            today
          );
          upserted += 1;
        }
      }
      return { upserted };
    });

    return { status: "ok", ratesInserted: snap.inserted, invoicesUpserted: invoices.upserted };
  }
);
