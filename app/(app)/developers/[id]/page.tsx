import { notFound } from "next/navigation";
import { getDeveloperDetail, getProvidersList } from "./actions";
import { DeveloperDetail } from "./developer-detail";

export default async function DeveloperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, providersList] = await Promise.all([
    getDeveloperDetail(id),
    getProvidersList(),
  ]);

  if (!data) notFound();

  return (
    <DeveloperDetail
      developer={data.developer}
      keys={data.keys}
      providers={providersList}
    />
  );
}
