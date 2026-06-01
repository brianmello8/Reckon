import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { resolveRange } from "../period";
import {
  getWorkflowsOverview,
  getAgentsOverview,
  getCustomerCosts,
} from "../queries";
import { WorkflowsClient } from "./workflows-client";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireSurface("workflows");
  const { range, from, to } = resolveRange((await searchParams).range);

  const [workflows, agents, customers] = await Promise.all([
    getWorkflowsOverview(user.orgId, from, to),
    getAgentsOverview(user.orgId, from, to),
    getCustomerCosts(user.orgId, from, to),
  ]);

  return (
    <div>
      <PageHead
        title="Workflows"
        sub="Cost per agent, workflow, and run — a product lens on AI spend. Run-level cost comes from your observability data joined to billed usage."
      />
      <WorkflowsClient
        range={range}
        workflows={workflows}
        agents={agents}
        customers={customers}
      />
    </div>
  );
}
