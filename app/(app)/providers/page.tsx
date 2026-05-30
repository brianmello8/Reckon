import { PageHead } from "@/components/reckon/page-head";
import { requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { providerKeys, providers, developers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { IngestNowButton } from "./ingest-button";
import {
  ProvidersClient,
  type KeyRow,
} from "./providers-client";

const PROVIDER_DOCS: Record<string, { docUrl: string; description: string }> = {
  anthropic: {
    docUrl: "https://console.anthropic.com/settings/admin-keys",
    description:
      "Requires an Admin API key. Go to Settings → Admin API keys in the Anthropic console. Available on Team/Enterprise plans.",
  },
  openai: {
    docUrl: "https://platform.openai.com/api-keys",
    description:
      'Create a key with the "Usage: Read" permission scope. Available under API keys in the OpenAI dashboard.',
  },
  github_copilot: {
    docUrl: "https://docs.github.com/en/rest/copilot/copilot-usage",
    description:
      "Requires a GitHub personal access token with org admin scope, or a GitHub App installation token. Format: org_name:token.",
  },
};

export default async function ProvidersPage() {
  const user = await requireUser();

  const allProviders = await db
    .select()
    .from(providers)
    .orderBy(providers.displayName);

  const [devs, keys] = await withOrgContext(user.orgId, async (tx) => {
    const devs = await tx
      .select({ id: developers.id, displayName: developers.displayName })
      .from(developers)
      .where(eq(developers.orgId, user.orgId))
      .orderBy(developers.displayName);

    const keys = await tx
      .select({
        providerId: providerKeys.providerId,
        fingerprint: providerKeys.keyFingerprint,
        status: providerKeys.status,
        developerName: developers.displayName,
      })
      .from(providerKeys)
      .innerJoin(developers, eq(providerKeys.developerId, developers.id))
      .where(eq(providerKeys.orgId, user.orgId));

    return [devs, keys] as const;
  });

  const keysByProvider: Record<string, KeyRow[]> = {};
  for (const k of keys) {
    (keysByProvider[k.providerId] ??= []).push({
      fingerprint: k.fingerprint,
      status: k.status,
      developerName: k.developerName,
    });
  }

  const providerRows = allProviders.map((p) => ({
    id: p.id,
    key: p.key,
    displayName: p.displayName,
    docUrl: PROVIDER_DOCS[p.key]?.docUrl,
    description: PROVIDER_DOCS[p.key]?.description,
  }));

  return (
    <div>
      <PageHead
        title="Providers"
        sub="Connect provider keys to start tracking spend. Keys are validated, then encrypted at rest."
      >
        <IngestNowButton />
      </PageHead>

      <ProvidersClient
        providers={providerRows}
        developers={devs}
        keysByProvider={keysByProvider}
      />
    </div>
  );
}
