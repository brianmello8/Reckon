"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { claimInvite } from "./actions";

type Provider = { key: string; name: string; id: string };

export function InviteForm({
  token,
  providers,
}: {
  token: string;
  providers: Provider[];
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit() {
    const entries = Object.entries(keys)
      .filter(([, v]) => v.trim())
      .map(([providerKey, apiKey]) => ({ providerKey, apiKey }));

    if (entries.length === 0) {
      setError("Please add at least one API key.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await claimInvite(token, entries);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  if (done) {
    return (
      <div className="mt-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Check className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">You're all set!</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Your API keys have been saved and encrypted. Your usage data will
          start appearing in your team's dashboard within the hour.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {providers
        .filter((p) => p.key !== "github_copilot")
        .map((provider) => (
          <Card key={provider.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{provider.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor={provider.key}>API key</Label>
              <Input
                id={provider.key}
                type="password"
                placeholder="sk-..."
                className="mt-1 font-mono"
                value={keys[provider.key] ?? ""}
                onChange={(e) =>
                  setKeys((prev) => ({
                    ...prev,
                    [provider.key]: e.target.value,
                  }))
                }
              />
              <p className="mt-1 text-xs text-zinc-500">
                Optional — skip if you don't use {provider.name}.
              </p>
            </CardContent>
          </Card>
        ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full"
      >
        {pending ? "Validating & saving..." : "Save keys"}
      </Button>

      <p className="text-center text-xs text-zinc-500">
        Keys are encrypted at rest and never visible after entry.
      </p>
    </div>
  );
}
