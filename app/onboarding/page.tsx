"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { ensureOrgRow, checkOrgExists } from "./actions";
import { Logo } from "@/components/reckon/primitives";

const STEPS = ["Workspace", "Connect key", "Invite team", "Done"];

export default function OnboardingPage() {
  const router = useRouter();
  const { createOrganization, setActive, isLoaded } = useOrganizationList();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // If the user already has an active org, skip onboarding.
  useEffect(() => {
    checkOrgExists()
      .then((org) => {
        if (org) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "your-team";

  async function handleSubmit(formData: FormData) {
    if (!isLoaded || !createOrganization || !setActive) return;
    setPending(true);
    setError(null);
    try {
      const orgName = String(formData.get("name") ?? name).trim();
      const orgSlug =
        orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || `team-${Date.now()}`;

      // Create the org client-side (Frontend API) so it becomes the
      // ACTIVE organization on the session — server components then see auth().orgId.
      // NB: don't pass `slug` — the Clerk instance doesn't have org slugs enabled,
      // and our own DB owns the slug anyway (mirrored below from `orgSlug`).
      const org = await createOrganization({ name: orgName });
      await setActive({ organization: org.id });

      // Mirror into our DB synchronously so /dashboard doesn't race the webhook.
      await ensureOrgRow({
        clerkOrgId: org.id,
        name: orgName,
        slug: org.slug ?? orgSlug,
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-warm px-6 py-12">
      <Logo size={30} />

      {/* Stepper */}
      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                i === 0
                  ? "bg-ink text-paper"
                  : "border border-line-2 text-ink-4"
              }`}
            >
              {i + 1}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-line-2" />}
          </div>
        ))}
      </div>

      <div className="mt-8 w-full max-w-[520px] rounded-xl border border-line bg-paper p-7 shadow-sm fade-up">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Name your workspace
        </h1>
        <p className="mt-2 text-[14px] text-ink-2">
          This is your team&apos;s home in Reckon. You&apos;ll connect provider
          keys and invite developers next.
        </p>

        <form action={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-[13px] font-medium text-ink-2">
              Workspace name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Northwind"
              className="h-10 w-full rounded-lg border border-line-2 bg-paper px-3 text-[14px] text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-2 px-3 py-2.5 text-[13px] text-ink-3">
            <span className="mono text-ink-2">{slug}.reckon.dev</span>
            <span className="ml-auto inline-flex items-center gap-1 text-pos">
              <Check className="h-3.5 w-3.5" /> available
            </span>
          </div>

          {error && <p className="text-[13px] text-crit">{error}</p>}

          <button
            type="submit"
            disabled={pending || !isLoaded}
            className="h-10 w-full rounded-lg bg-brand text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-[12.5px] text-ink-3">
        Read-only · we never see your prompts or responses.
      </p>
    </div>
  );
}
