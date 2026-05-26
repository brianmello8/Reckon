"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrganization } from "./actions";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await createOrganization(formData);
      // Give Clerk a moment to propagate the org membership, then redirect
      await new Promise((r) => setTimeout(r, 1000));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your organization
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            This is your team&apos;s workspace in Reckon. You can invite
            developers after setup.
          </p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-700"
            >
              Organization name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              placeholder="Acme Inc."
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending ? "Creating..." : "Create organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
