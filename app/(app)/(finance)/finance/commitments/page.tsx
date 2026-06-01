import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getCommitments, getProvidersList } from "./actions";
import { CommitmentsClient } from "./commitments-client";

export default async function CommitmentsPage() {
  await requireSurface("finance");
  const [commitments, providers] = await Promise.all([getCommitments(), getProvidersList()]);
  return (
    <div>
      <PageHead
        title="Commitments"
        sub="Track committed-use deals, enterprise agreements, and prepaid credits — drawdown, projected end-of-term position, and alerts on under-utilization, overage, and expiry."
      />
      <CommitmentsClient commitments={commitments} providers={providers} />
    </div>
  );
}
