import { getAnomalies } from "./actions";
import { AnomaliesList } from "./anomalies-list";
import { PageHead } from "@/components/reckon/page-head";

export default async function AnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = (params.filter ?? "all") as "all" | "unacknowledged" | "acknowledged";
  const anomalies = await getAnomalies(filter);

  return (
    <div>
      <PageHead
        title="Anomalies"
        sub="Unusual spend patterns flagged at mean + 3σ across your developers."
      />
      <AnomaliesList anomalies={anomalies} currentFilter={filter} />
    </div>
  );
}
