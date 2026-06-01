import { PageHead } from "@/components/reckon/page-head";
import { requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { providerKeys, providers, developers } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { IngestNowButton } from "./ingest-button";
import { ProvidersClient } from "./providers-client";
import {
  getProviderIdentities,
  getAgents,
  getAttributionCoverage,
} from "./actions";

const PROVIDER_DOCS: Record<string, { docUrl: string; description: string }> = {
  anthropic: {
    docUrl: "https://console.anthropic.com/settings/admin-keys",
    description:
      "Create an Admin API key (Console → Settings → Admin keys). Reports usage for the whole org, broken down per API key.",
  },
  openai: {
    docUrl: "https://platform.openai.com/settings/organization/admin-keys",
    description:
      "Create an Admin key (Settings → Organization → Admin keys). Reports org usage broken down per user.",
  },
  github_copilot: {
    docUrl: "https://docs.github.com/en/rest/copilot/copilot-user-management",
    description:
      "A token with org admin / manage_billing:copilot scope. Attributes the flat per-seat fee to each assigned login. Format: org_name:token.",
  },
  openrouter: {
    docUrl: "https://openrouter.ai/docs/features/provisioning-api-keys",
    description:
      "Create a Provisioning (management) key under Settings → Keys. Tracks spend across every model routed through OpenRouter, broken down per API key. Works on any plan.",
  },
};

export default async function ProvidersPage() {
  const user = await requireUser();

  const allProviders = await db
    .select()
    .from(providers)
    .orderBy(providers.displayName);

  const [keys, devs, identities, agentsList, coverage] = await Promise.all([
    withOrgContext(user.orgId, async (tx) =>
      tx
        .select({
          providerId: providerKeys.providerId,
          fingerprint: providerKeys.keyFingerprint,
          lastPolledAt: providerKeys.lastPolledAt,
          lastError: providerKeys.lastError,
        })
        .from(providerKeys)
        .where(
          and(
            eq(providerKeys.orgId, user.orgId),
            eq(providerKeys.status, "active")
          )
        )
        .orderBy(desc(providerKeys.createdAt))
    ),
    withOrgContext(user.orgId, async (tx) =>
      tx
        .select({ id: developers.id, displayName: developers.displayName })
        .from(developers)
        .where(eq(developers.orgId, user.orgId))
        .orderBy(developers.displayName)
    ),
    getProviderIdentities(),
    getAgents(),
    getAttributionCoverage(),
  ]);

  const keyByProvider = new Map(keys.map((k) => [k.providerId, k]));

  const providerRows = allProviders.map((p) => {
    const k = keyByProvider.get(p.id);
    return {
      id: p.id,
      key: p.key,
      displayName: p.displayName,
      docUrl: PROVIDER_DOCS[p.key]?.docUrl,
      description: PROVIDER_DOCS[p.key]?.description,
      connected: !!k,
      fingerprint: k?.fingerprint ?? null,
      lastPolledAt: k?.lastPolledAt ? k.lastPolledAt.toISOString() : null,
      lastError: k?.lastError ?? null,
    };
  });

  return (
    <div>
      <PageHead
        title="Providers"
        sub="Connect one org admin key per provider. Usage is attributed to developers automatically; map any unassigned identities below."
      >
        <IngestNowButton />
      </PageHead>

      <ProvidersClient
        providers={providerRows}
        developers={devs}
        identities={identities}
        agents={agentsList}
        coverage={coverage}
      />
    </div>
  );
}
