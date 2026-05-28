import Link from "next/link";
import { SignUpButton, Show } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reckon — Know exactly what your team spends on AI",
  description:
    "Per-developer attribution for Anthropic, OpenAI, and Copilot. Anomaly alerts in Slack. No proxy required.",
};

const FEATURES = [
  {
    title: "Per-developer attribution",
    body: "See exactly who is spending what across Anthropic, OpenAI, and GitHub Copilot — joined to real people, not anonymous keys.",
  },
  {
    title: "Anomaly alerts in Slack",
    body: "When someone's spend spikes 4× their normal, you hear about it the same day — not at the end of the month when the invoice lands.",
  },
  {
    title: "Zero workflow changes",
    body: "We poll provider usage APIs on a schedule. No proxy, no latency, no changes to how your developers work. They feel nothing.",
  },
];

const FAQ = [
  {
    q: "Do you see our prompts or responses?",
    a: "No. We are a passive observer — we poll the providers' usage APIs and read what they already report. We never sit in your request path and never see content.",
  },
  {
    q: "How does per-developer attribution work?",
    a: "Each developer uses their own API key, tagged with their identity in Reckon. Provider usage APIs report at the key level, so we join usage straight through to the person — no proxy required.",
  },
  {
    q: "Which providers do you support?",
    a: "Anthropic, OpenAI, and GitHub Copilot in v1. More as customers ask.",
  },
  {
    q: "Will this slow down our AI calls?",
    a: "No. We are never in the request path. There is zero added latency because we don't touch live traffic.",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight text-zinc-900">
          Know exactly what your team spends on AI.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600">
          Per-developer attribution for Anthropic, OpenAI, and Copilot. Anomaly
          alerts in Slack. No proxy required.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800">
                Start free
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Go to dashboard
            </Link>
          </Show>
          <Link
            href="/pricing"
            className="rounded-md border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* The problem */}
      <section className="border-y bg-zinc-50">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            The problem
          </h2>
          <p className="mt-4 text-2xl font-medium leading-relaxed text-zinc-900">
            Some of the world&apos;s largest companies have blown through annual
            AI budgets in months. The spend is real, it&apos;s growing, and most
            engineering managers have no idea who&apos;s driving it until the
            invoice arrives.
          </p>
          <p className="mt-4 text-lg text-zinc-600">
            Reckon gives you per-developer visibility and same-day anomaly
            alerts, so a runaway script or a misconfigured agent never becomes a
            surprise five-figure line item.
          </p>
        </div>
      </section>

      {/* The product */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          One thing, done well.
        </h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h3 className="text-lg font-medium text-zinc-900">{f.title}</h3>
              <p className="mt-2 text-zinc-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing snapshot */}
      <section className="border-y bg-zinc-50">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Simple, per-seat pricing.
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            Free for up to 3 developers. Pro is $19 per developer per month, with
            a $99/mo minimum. No per-event fees. No surprise overages. Cancel
            anytime.
          </p>
          <Link
            href="/pricing"
            className="mt-8 inline-block rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            See full pricing
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">
          Frequently asked
        </h2>
        <div className="mt-10 space-y-8">
          {FAQ.map((item) => (
            <div key={item.q}>
              <h3 className="font-medium text-zinc-900">{item.q}</h3>
              <p className="mt-2 text-zinc-600">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Stop guessing what AI costs you.
          </h2>
          <div className="mt-8">
            <Show when="signed-out">
              <SignUpButton mode="modal">
                <button className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800">
                  Start free
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Go to dashboard
              </Link>
            </Show>
          </div>
        </div>
      </section>
    </div>
  );
}
