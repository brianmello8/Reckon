import { PageHead } from "@/components/reckon/page-head";
import { requireSurface, hasSurface } from "@/lib/auth";
import { getShowback, getBudgetVsActual, periodRange } from "./queries";
import { getBudgets } from "./actions";
import { getDimensions } from "./dimensions/actions";
import { ShowbackClient } from "./showback-client";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireSurface("finance");
  const now = new Date();
  const defaultPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const period = (await searchParams).period ?? defaultPeriod;
  const { from, to } = periodRange(period);

  const [showback, budgetVsActual, budgetRows, dims] = await Promise.all([
    getShowback(user.orgId, from, to),
    getBudgetVsActual(user.orgId, period),
    getBudgets(period),
    getDimensions(),
  ]);

  const active = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status === "active");

  return (
    <div>
      <PageHead
        title="Finance"
        sub="Showback you can trust — every dollar rolls up to your dimensions and reconciles to billed usage. Shared keys fan out across cost centers."
      />
      <ShowbackClient
        period={period}
        from={from}
        to={to}
        showback={showback}
        budgetVsActual={budgetVsActual}
        budgets={budgetRows.map((b) => ({
          id: b.id,
          scopeType: b.scopeType,
          scopeId: b.scopeId,
          amountMicros: b.amountMicros.toString(),
        }))}
        canSeeDevelopers={hasSurface(user, "operations")}
        scopeOptions={{
          cost_center: active(dims.costCenters).map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` })),
          gl_account: active(dims.glAccounts).map((g) => ({ id: g.id, label: `${g.code} · ${g.name}` })),
          project: active(dims.projects).map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })),
        }}
      />
    </div>
  );
}
