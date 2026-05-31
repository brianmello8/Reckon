import { notFound } from "next/navigation";
import { getDeveloperDetail } from "./actions";
import { DeveloperDetail } from "./developer-detail";

export default async function DeveloperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDeveloperDetail(id);

  if (!data) notFound();

  return <DeveloperDetail developer={data.developer} keys={data.keys} />;
}
