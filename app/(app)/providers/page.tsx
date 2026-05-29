import { PageHead } from "@/components/reckon/page-head";
import { requireUser } from "@/lib/auth";
import { withOrgContext } from "@/lib/db/rls";
import { providerKeys, providers } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { IngestNowButton } from "./ingest-button";

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

  const keyCounts = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({
        providerId: providerKeys.providerId,
        activeCount: count(providerKeys.id),
      })
      .from(providerKeys)
      .where(
        and(
          eq(providerKeys.orgId, user.orgId),
          eq(providerKeys.status, "active")
        )
      )
      .groupBy(providerKeys.providerId);
  });

  const countMap = new Map(
    keyCounts.map((k) => [k.providerId, Number(k.activeCount)])
  );

  return (
    <div>
      <PageHead title="Providers" sub="AI providers we poll for usage and cost.">
        <IngestNowButton />
      </PageHead>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allProviders.map((provider) => {
          const docs = PROVIDER_DOCS[provider.key];
          const activeKeys = countMap.get(provider.id) ?? 0;

          return (
            <Card key={provider.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {provider.displayName}
                  </CardTitle>
                  <Badge variant={activeKeys > 0 ? "default" : "secondary"}>
                    {activeKeys} active {activeKeys === 1 ? "key" : "keys"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-600">
                  Total cost last 30 days:{" "}
                  <span className="font-medium">$0.00</span>
                </p>
                {docs && (
                  <div className="mt-3">
                    <p className="text-xs text-zinc-500">{docs.description}</p>
                    <a
                      href={docs.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900"
                    >
                      Setup instructions
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
