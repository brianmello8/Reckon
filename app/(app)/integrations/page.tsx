import { getIntegrationsData } from "./actions";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsPage() {
  const data = await getIntegrationsData();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Connect Slack and Linear to receive digests and anomaly alerts.
      </p>

      <div className="mt-6">
        <IntegrationsClient slack={data.slack} />
      </div>
    </div>
  );
}
