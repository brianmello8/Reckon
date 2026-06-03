import { PageHead } from "@/components/reckon/page-head";
import { requireUser } from "@/lib/auth";
import { getObservabilityConnections } from "./actions";
import { ObservabilityClient } from "./observability-client";

export default async function ObservabilityPage() {
  await requireUser();
  const connections = await getObservabilityConnections();

  return (
    <div>
      <PageHead
        title="Observability"
        sub="Connect Langfuse to attribute spend to workflows and runs. We read metadata only — run ids, timing, model, and token counts — never prompts or responses."
      />
      <ObservabilityClient
        connections={connections.map((c) => ({
          ...c,
          lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
