import { ShareBar } from "@/components/reckon/primitives";

/* Realistic data snips from the Pro Finance surface — static, marketing only. */

const money = (n: number, dp = 2) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" }) {
  const cls =
    tone === "good"
      ? "bg-[color-mix(in_oklab,var(--pos)_13%,var(--paper))] text-pos border-[color-mix(in_oklab,var(--pos)_28%,var(--paper))]"
      : "bg-bg-2 text-ink-2 border-line";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${cls}`}>{children}</span>;
}

export function FinanceShowcase() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* ── Reconciliation ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <Eyebrow>Invoice reconciliation</Eyebrow>
          <Pill tone="good">● explained</Pill>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["Billed", money(4180.5)],
            ["Observed", money(4205.2)],
            ["Delta", "−" + money(24.7)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-line bg-bg-2 px-2 py-1.5">
              <div className="text-[10.5px] text-ink-3">{l}</div>
              <div className="mono text-[13px] font-semibold text-ink">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-[12.5px]">
          {[
            ["Credit applied", "−" + money(42), "pos"],
            ["Untracked keys", "+" + money(18), "ink"],
            ["Rounding", "−" + money(0.7), "pos"],
          ].map(([l, v, c]) => (
            <div key={l} className="flex items-center justify-between">
              <span className="text-ink-2">{l}</span>
              <span className={`mono ${c === "pos" ? "text-pos" : "text-ink"}`}>{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Every dollar of the provider invoice matched to observed usage — an honest &ldquo;unknown&rdquo; beats a forced explanation.
        </p>
      </div>

      {/* ── Month-end accrual ────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <Eyebrow>Month-end accrual</Eyebrow>
          <div className="flex gap-1.5"><Pill>draft JE</Pill><Pill tone="good">balanced</Pill></div>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[12px]">
            <thead className="bg-bg-2 text-left text-[10.5px] uppercase tracking-wide text-ink-3">
              <tr><th className="px-2.5 py-1.5">GL × cost center</th><th className="px-2.5 py-1.5 text-right">Debit</th><th className="px-2.5 py-1.5 text-right">Credit</th></tr>
            </thead>
            <tbody className="mono text-ink-2">
              <tr className="border-t border-line"><td className="px-2.5 py-1.5">6000 · Platform Eng</td><td className="px-2.5 py-1.5 text-right">{money(3960)}</td><td /></tr>
              <tr className="border-t border-line"><td className="px-2.5 py-1.5">6000 · Data</td><td className="px-2.5 py-1.5 text-right">{money(2210)}</td><td /></tr>
              <tr className="border-t border-line"><td className="px-2.5 py-1.5 text-ink-3">2150 · Accrued liab.</td><td /><td className="px-2.5 py-1.5 text-right">{money(7940)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Coded usage <b className="text-ink-2">{money(6200, 0)}</b> + forecast tail <b className="text-ink-2">{money(1740, 0)}</b> = a balanced draft entry. Reverse &amp; true-up next period; nothing posts externally.
        </p>
      </div>

      {/* ── Unit economics ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <Eyebrow>Unit economics</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            ["Revenue", money(142000, 0), false],
            ["AI COGS", money(8260, 0), false],
            ["AI COGS % of revenue", "5.8%", true],
            ["Gross margin", "94.2%", false],
          ].map(([l, v, accent]) => (
            <div key={l as string} className={`rounded-lg border px-3 py-2 ${accent ? "border-brand-line bg-brand-soft" : "border-line bg-bg-2"}`}>
              <div className="text-[10.5px] text-ink-3">{l}</div>
              <div className={`mono text-[15px] font-semibold ${accent ? "text-brand-ink" : "text-ink"}`}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-[12.5px]">
          <span className="text-ink-2">Support Triage Bot</span>
          <span className="mono text-ink">$0.43 / ticket</span>
        </div>
        <div className="mt-1"><ShareBar parts={[{ k: "cogs", value: 5.8 }]} total={100} h={4} /></div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          AI COGS as a share of revenue, gross margin by product line, and cost per outcome — the board-ready numbers.
        </p>
      </div>

      {/* ── GL-ready export ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <Eyebrow>GL-ready export</Eyebrow>
          <Pill>content-hashed</Pill>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[12px]">
            <thead className="bg-bg-2 text-left text-[10.5px] uppercase tracking-wide text-ink-3">
              <tr><th className="px-2.5 py-1.5">Batch</th><th className="px-2.5 py-1.5">Format</th><th className="px-2.5 py-1.5 text-right">Status</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <td className="px-2.5 py-1.5 mono text-[11px] text-ink-2">RCKN-2026-05-4F2A91C0</td>
                <td className="px-2.5 py-1.5 text-ink-2">NetSuite CSV</td>
                <td className="px-2.5 py-1.5 text-right"><Pill>downloaded</Pill></td>
              </tr>
              <tr className="border-t border-line">
                <td className="px-2.5 py-1.5 mono text-[11px] text-ink-2">RCKN-2026-04-1B77DE03</td>
                <td className="px-2.5 py-1.5 text-ink-2">QuickBooks IIF</td>
                <td className="px-2.5 py-1.5 text-right"><Pill tone="good">acknowledged</Pill></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-3">
          <span className="mono text-ink-2">6000 · AI COGS</span>
          <span>→</span>
          <span className="mono text-ink-2">60000</span>
          <Pill tone="good">mapped</Pill>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Approved entries export to NetSuite, QuickBooks, Xero, or Intacct — deterministic, re-import-safe, mapped to your real codes.
        </p>
      </div>
    </div>
  );
}
