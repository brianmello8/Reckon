import { requireUser } from "@/lib/auth";
import { format, subDays } from "date-fns";
import { getDashboardData } from "./queries";
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

  const data = await getDashboardData(user.orgId, from, to);

  return (
    <DashboardClient
      data={data}
      range={range}
      from={from}
      to={to}
    />
  );
}
