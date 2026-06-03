import Link from "next/link";
import { SignUpButton, Show } from "@clerk/nextjs";
import { FinanceShowcase } from "@/components/reckon/finance-showcase";
import { JsonLd } from "@/components/reckon/json-ld";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Pro Finance — close-ready financials for AI spend",
  description:
    "Code AI spend to your GL, reconcile it to the provider invoice, generate the month-end accrual as a balanced journal entry, track margin, and export a GL-ready file to NetSuite, QuickBooks, Xero, or Intacct.",
  path: "/pro-finance",
});

const STAGES = [
  {
    k: "Allocate",
    t: "Code every dollar to your GL.",
    b: "Cost centers, GL accounts, entities, projects, product lines — every usage event coded by priority rules. Shared keys split across cost centers by allocation drivers, and uncoded spend never silently disappears.",
  },
  {
    k: "Verify",
    t: "Trust the numbers.",
    b: "Capture provider invoices and reconcile each to observed usage — explaining every dollar of the gap, with an honest “unknown” when it's genuinely unexplained. Track committed-use deals and prepaid credits against drawdown, and forecast where the month lands.",
  },
  {
    k: "Close",
    t: "Close the month.",
    b: "Timezone-correct accounting periods, then a month-end accrual generated as a balanced draft journal entry (coded usage + forecast tail). Reverse and true-up next period, and export a GL-ready, content-hashed batch — nothing posts to your books without you.",
  },
  {
    k: "Analyze",
    t: "Prove it's worth it.",
    b: "AI COGS as a percent of revenue, gross margin by product line, and cost per customer and per workflow outcome. The board-ready numbers — reconciled exactly to the underlying usage.",
  },
];

const STACK = ["NetSuite", "QuickBooks", "Xero", "Sage Intacct", "Generic CSV", "Ramp / Brex splits"];

const FAQ = [
  {
    q: "Does this replace our close tool?",
    a: "No. Reckon is AI-spend-only — it produces the AI accrual, the coded cost allocations, and a GL-ready file, then feeds them into the GL/ERP and close tool you already run. It doesn't run your whole month-end close.",
  },
  {
    q: "Do you post directly to our accounting system?",
    a: "File-first by default: we generate a deterministic, content-hashed, re-import-safe file you import yourself — so the human stays in the loop and we hold no write credentials. An optional live API push is available for a specific system on request.",
  },
  {
    q: "How accurate is the accrual?",
    a: "It's your real-time usage plus a forecast tail for the not-yet-reported days. We track accrual-vs-actual accuracy every period as audit evidence, so you can see the estimate is trustworthy.",
  },
  {
    q: "Is the finance suite part of the free trial?",
    a: "No — the 7-day free trial covers the Entry tier. Pro Finance is a paid add-on on top of Pro, billed as a flat monthly fee, org-wide.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

export default function FinancePage() {
  return (
    <div>
      <JsonLd data={faqLd} />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-12 pt-20">
        <span className="inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12.5px] font-medium text-brand-ink">
          Pro Finance
        </span>
        <h1 className="mt-6 max-w-3xl text-[clamp(34px,5.5vw,54px)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">
          Turn AI spend into close-ready financials.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">
          Reckon already attributes every AI dollar to a developer and a workflow. Pro Finance
          takes it the rest of the way — coded to your GL, reconciled to the invoice, accrued,
          and exported to your books. AI spend lands in your ledger, not a spreadsheet.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Show when="signed-out">
            <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
              <button className="h-11 rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
                Start free trial
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/billing" className="inline-flex h-11 items-center rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
              Add Pro Finance
            </Link>
          </Show>
          <Link href="/pricing" className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-paper px-6 text-[15px] font-medium text-ink hover:bg-bg-2">
            See pricing
          </Link>
        </div>
      </section>

      {/* The data snips */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <FinanceShowcase />
      </section>

      {/* The four stages */}
      <section className="border-y border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
            From raw usage to a balanced journal entry.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] text-ink-2">
            The finance surface follows the close, in four stages.
          </p>
          <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {STAGES.map((s) => (
              <div key={s.k}>
                <span className="eyebrow">{s.k}</span>
                <h3 className="mt-2 text-[18px] font-semibold text-ink">{s.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fits your stack */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
          Fits the stack you already run.
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] text-ink-2">
          Upload your real chart of accounts, map Reckon&rsquo;s dimensions to your codes, and
          export a file your accounting system imports cleanly — deterministic and re-import-safe.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {STACK.map((s) => (
            <span key={s} className="inline-flex items-center rounded-lg border border-line bg-paper px-4 py-2 text-[14px] font-medium text-ink-2 shadow-sm">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-line bg-paper">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
            Finance FAQ
          </h2>
          <div className="mt-8 space-y-6">
            {FAQ.map((f) => (
              <div key={f.q}>
                <h3 className="font-medium text-ink">{f.q}</h3>
                <p className="mt-1 text-ink-2">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
            Close your AI spend, not your spreadsheet.
          </h2>
          <p className="mt-3 text-[15px] text-ink-2">
            Start free, then add Pro Finance when you&rsquo;re ready to take it to the ledger.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="h-11 rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
                  Start free trial
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/billing" className="inline-flex h-11 items-center rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
                Add Pro Finance
              </Link>
            </Show>
            <Link href="/demo" className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-paper px-6 text-[15px] font-medium text-ink hover:bg-bg-2">
              Explore the demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
