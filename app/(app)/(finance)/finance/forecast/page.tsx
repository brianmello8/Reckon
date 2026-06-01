import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getForecastView } from "./actions";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";

const money = (m: string) => fmtMoney(microsToDollars(Number(m)));

export default async function ForecastPage() {
  await requireSurface("finance");
  const view = await getForecastView();

  return (
    <div>
      <PageHead
        title="Forecast"
        sub="Where each provider invoice is trending this month, from month-to-date run-rate plus a remaining-days tail. Simple and explainable — no black box."
      />
      {view.providers.length === 0 ? (
        <p className="text-sm text-zinc-500">No usage this month yet — nothing to forecast.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {view.providers.map((p) => (
            <div key={p.provider} className="rounded-xl border border-line bg-paper p-5">
              <div className="text-[15px] font-semibold text-ink">{p.providerName}</div>
              {!p.projection ? (
                <p className="mt-2 text-sm text-zinc-500">Not enough data to forecast yet.</p>
              ) : (
                <>
                  <div className="mt-2 text-[26px] font-semibold tracking-tight text-ink">
                    ≈ {money(p.projection.projectedTotal)}
                    <span className="ml-1 text-[15px] font-normal text-ink-3">
                      ±{p.projection.bandPct}%
                    </span>
                  </div>
                  <div className="text-[13px] text-ink-2">
                    by {view.monthEnd} · {money(p.projection.low)}–{money(p.projection.high)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                    <Stat label="MTD observed" value={money(p.projection.mtdObserved)} />
                    <Stat label="Daily run-rate" value={money(p.projection.runRateDaily)} />
                    <Stat label="Through day" value={`${p.projection.throughDay}/${p.projection.daysInMonth}`} />
                    <Stat label="Remaining days" value={String(p.projection.remainingDays)} />
                  </div>
                  <p className="mt-3 text-[11.5px] text-ink-3">
                    {p.projection.formula}
                    {p.projection.seasonality && " · weekday/weekend seasonality applied"}
                  </p>
                  {p.accuracy.summary && (
                    <p className="mt-2 text-[12.5px] font-medium text-emerald-700">
                      {p.accuracy.summary}
                    </p>
                  )}
                  {p.accuracy.rows.length > 0 && (
                    <div className="mt-2 space-y-0.5 text-[12px] text-ink-3">
                      {p.accuracy.rows.map((r) => (
                        <div key={r.period} className="flex justify-between">
                          <span>{r.period}</span>
                          <span className="font-mono">
                            proj {money(r.projected)} vs {money(r.actual)} · ±{r.errorPct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-2 p-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="font-mono text-[13px] text-ink">{value}</div>
    </div>
  );
}
