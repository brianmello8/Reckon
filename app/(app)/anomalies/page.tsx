import { getAnomalies } from "./actions";
import { AnomaliesList } from "./anomalies-list";

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
      <h1 className="text-2xl font-semibold tracking-tight">Anomalies</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Unusual spending patterns detected across your developers.
      </p>

      <div className="mt-6">
        <AnomaliesList anomalies={anomalies} currentFilter={filter} />
      </div>
    </div>
  );
}
