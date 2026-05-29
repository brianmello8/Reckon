import { requireUser } from "@/lib/auth";
import { format, subDays } from "date-fns";
import { getDashboardData } from "./queries";
import { getAnomalies } from "../anomalies/actions";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const now = new Date();
  let from: string;
  let to: string;
  const range = params.range ?? "30d";

  switch (range) {
    case "7d":
      from = format(subDays(now, 7), "yyyy-MM-dd");
      to = format(now, "yyyy-MM-dd");
      break;
    case "90d":
      from = format(subDays(now, 90), "yyyy-MM-dd");
      to = format(now, "yyyy-MM-dd");
      break;
    case "mtd":
      from = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
      to = format(now, "yyyy-MM-dd");
      break;
    case "custom":
      from = params.from ?? format(subDays(now, 30), "yyyy-MM-dd");
      to = params.to ?? format(now, "yyyy-MM-dd");
      break;
    default:
      from = format(subDays(now, 30), "yyyy-MM-dd");
      to = format(now, "yyyy-MM-dd");
  }

  const [data, anomalies] = await Promise.all([
    getDashboardData(user.orgId, from, to),
    getAnomalies("unacknowledged"),
  ]);

  const recentAnomalies = anomalies.slice(0, 4).map((a) => ({
    id: a.id,
    developerId: a.developerId,
    developerName: a.developerName,
    kind: a.kind,
    severity: a.severity as "info" | "warn" | "critical",
    multiple:
      (a.details as Record<string, unknown> | null)?.multiple != null
        ? Number((a.details as Record<string, unknown>).multiple)
        : null,
    detectedAt:
      a.detectedAt instanceof Date
        ? a.detectedAt.toISOString()
        : String(a.detectedAt),
  }));

  return (
    <DashboardClient
      data={data}
      range={range}
      orgName={user.orgName}
      recentAnomalies={recentAnomalies}
    />
  );
}
