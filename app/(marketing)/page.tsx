import Link from "next/link";
import { SignUpButton, Show } from "@clerk/nextjs";
import { HeroMock } from "@/components/reckon/hero-mock";
import { MarketingShowcase, SlackMark } from "@/components/reckon/marketing-showcase";
import { FinanceShowcase } from "@/components/reckon/finance-showcase";
import { Spike } from "@/components/reckon/primitives";
import { JsonLd } from "@/components/reckon/json-ld";
import {
  pageMetadata,
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/seo";

export const metadata = pageMetadata({
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

const STEPS = [
  { n: "1", t: "Connect provider keys", b: "Each developer adds their own Anthropic, OpenAI, or Copilot key. No proxy, no SDK, no code changes." },
  { n: "2", t: "We poll usage hourly", b: "Reckon reads the providers' own usage APIs and attributes every dollar to a developer, model, and day." },
  { n: "3", t: "Get digests + alerts", b: "A daily Slack digest, weekly recap, and same-day anomaly alerts when someone's spend spikes." },
];

const FEATURES = [
  { t: "Per-developer attribution", b: "See exactly who spends what across every provider — joined to real people, not anonymous keys." },
  { t: "Anomaly alerts in Slack", b: "When spend spikes 4× normal, you hear about it the same day — not when the invoice lands." },
  { t: "Slack + Linear built in", b: "Daily digests to a channel, and a Linear issue filed automatically on every critical anomaly." },
  { t: "Run-rate forecasting", b: "Project the month from the trend so a runaway agent never becomes a surprise five-figure line item." },
];

const SECURITY = [
  { t: "Read-only by design", b: "We never sit in your request path. No proxy, no TLS termination, no latency." },
  { t: "We never see content", b: "We poll usage APIs for token counts and cost. Prompts and responses never reach us." },
  { t: "Keys encrypted with KMS", b: "Envelope encryption per key; decrypted only inside the ingestion worker, never the web app." },
];

const FAQ = [
  { q: "Do you see our prompts or responses?", a: "No. We poll the providers' usage APIs and read what they already report. We never sit in your request path and never see content." },
  { q: "How does per-developer attribution work?", a: "Each developer uses their own API key, tagged with their identity in Reckon. Provider usage APIs report at the key level, so we join usage straight through to the person — no proxy required." },
  { q: "Which providers do you support?", a: "Anthropic, OpenAI, and GitHub Copilot in v1. More as customers ask." },
  { q: "Will this slow down our AI calls?", a: "No. We are never in the request path, so there is zero added latency." },
];

const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: [
    {
      "@type": "Offer",
      name: "Entry",
      price: "5",
      priceCurrency: "USD",
      description: "Up to 3 developers, one provider, daily digest. 7-day free trial.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "8",
      priceCurrency: "USD",
      description: "Per tracked-developer seat / month, pick any number (min 3). All providers, workflows, weekly digest, Linear.",
    },
    {
      "@type": "Offer",
      name: "Pro Finance",
      price: "499",
      priceCurrency: "USD",
      description: "Pro plus a flat monthly add-on: cost allocation, reconciliation, accruals, unit economics, and GL/ERP export.",
    },
  ],
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function HomePage() {
  return (
    <div>
      <JsonLd data={softwareLd} />
      <JsonLd data={faqLd} />
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-10 pt-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12.5px] font-medium text-brand-ink">
          <Spike size={15} /> Read-only · never sees your prompts
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-[clamp(36px,6vw,60px)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">
          Know exactly where your AI spend is going.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-2">
          Per-developer attribution for Anthropic, OpenAI, and Copilot. Anomaly
          alerts in Slack. No proxy required.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Show when="signed-out">
            <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
              <button className="h-11 rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
                Start free trial
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className="inline-flex h-11 items-center rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
              Go to dashboard
            </Link>
          </Show>
          <Link
            href="/demo"
            className="inline-flex h-11 items-center rounded-lg border border-line-2 bg-paper px-6 text-[15px] font-medium text-ink hover:bg-bg-2"
          >
            Explore the demo
          </Link>
        </div>
        <p className="mt-4 text-[13px] text-ink-3">
          7-day free trial · no credit card · 5-minute setup
        </p>
      </section>

      {/* Dashboard mock */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <HeroMock />
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
            How it works
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span className="mono flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-[15px] font-semibold text-brand-ink">
                  {s.n}
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-ink">{s.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcase — where your spend shows up (Slack-forward) */}
      <section className="border-b border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-bg-warm px-3 py-1 text-[12.5px] font-medium text-ink-2">
            <SlackMark size={15} /> Slack app included
          </span>
          <h2 className="mt-5 max-w-2xl text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
            Your spend, where your team already looks.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] text-ink-2">
            Install the Reckon Slack app and a daily digest posts to your
            channel, anomaly alerts fire the same day with one-click acknowledge,
            and anyone can pull numbers with <span className="mono">/spend</span>.
            Critical anomalies also file a Linear issue automatically.
          </p>

          <div className="mt-8">
            <MarketingShowcase />
          </div>

          <div className="mt-8 grid gap-x-10 gap-y-3 text-[14px] text-ink-2 sm:grid-cols-2">
            <p>
              <span className="font-medium text-ink">Daily &amp; weekly digests</span> — totals,
              top spenders, and open anomalies posted to your channel.
            </p>
            <p>
              <span className="font-medium text-ink">Anomaly alerts</span> — severity-colored,
              with Acknowledge and Investigate right in Slack.
            </p>
            <p>
              <span className="font-medium text-ink">/spend slash command</span> — today,
              yesterday, this week, or a specific developer, on demand.
            </p>
            <p>
              <span className="font-medium text-ink">Linear integration</span> — every critical
              anomaly becomes an Urgent issue, auto-closed on acknowledge.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
          One thing, done well.
        </h2>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.t}>
              <h3 className="text-[16px] font-semibold text-ink">{f.t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{f.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pro Finance — what the finance side of the house does */}
      <section className="border-y border-line bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <span className="inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-3 py-1 text-[12.5px] font-medium text-brand-ink">
            Pro Finance
          </span>
          <h2 className="mt-5 max-w-2xl text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
            Turn AI spend into close-ready financials.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] text-ink-2">
            The finance suite codes every dollar to your GL and cost centers, reconciles it
            to the provider invoice, generates the month-end accrual as a balanced journal
            entry, computes margin and cost-per-outcome, and exports a GL-ready file — so AI
            spend lands in your books, not a spreadsheet.
          </p>
          <div className="mt-10">
            <FinanceShowcase />
          </div>
        </div>
      </section>

      {/* Security — intentionally always-navy panel (theme-independent) */}
      <section className="bg-[#1a2540]">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-white">
            Built to be the safest vendor you onboard.
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {SECURITY.map((s) => (
              <div key={s.t}>
                <h3 className="text-[15px] font-semibold text-white">{s.t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#b6bccb]">{s.b}</p>
              </div>
            ))}
          </div>
          <Link
            href="/security"
            className="mt-8 inline-block text-[13.5px] font-medium text-[#d2894a] hover:underline"
          >
            Read the full security overview →
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
          Frequently asked
        </h2>
        <div className="mt-10 space-y-8">
          {FAQ.map((item) => (
            <div key={item.q}>
              <h3 className="font-medium text-ink">{item.q}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.025em] text-ink">
            Stop guessing what AI costs you.
          </h2>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Show when="signed-out">
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="h-11 rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
                  Start free trial
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className="inline-flex h-11 items-center rounded-lg bg-brand px-6 text-[15px] font-medium text-white hover:opacity-90">
                Go to dashboard
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
