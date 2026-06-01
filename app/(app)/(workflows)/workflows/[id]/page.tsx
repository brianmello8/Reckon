import { notFound } from "next/navigation";
import { requireSurface } from "@/lib/auth";
import { resolveRange } from "../../period";
import { getWorkflowDetail } from "../../queries";
import { WorkflowDetailClient } from "./workflow-detail-client";

export default async function WorkflowDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireSurface("workflows");
  const { id } = await params;
  const { range, from, to } = resolveRange((await searchParams).range);

  const detail = await getWorkflowDetail(user.orgId, id, from, to);
  if (!detail) notFound();

  return <WorkflowDetailClient range={range} detail={detail} />;
}
