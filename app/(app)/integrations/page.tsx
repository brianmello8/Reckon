import { getIntegrationsData } from "./actions";
import { IntegrationsClient } from "./integrations-client";
import { PageHead } from "@/components/reckon/page-head";

export default async function IntegrationsPage() {
  const data = await getIntegrationsData();

  return (
    <div>
      <PageHead
        title="Integrations"
        sub="Route digests and anomaly alerts to Slack and Linear."
      />
      <IntegrationsClient slack={data.slack} linear={data.linear} />
    </div>
  );
}
