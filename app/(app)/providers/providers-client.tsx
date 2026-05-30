"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExternalLink, Plus, KeyRound } from "lucide-react";
import { connectProviderKey } from "./actions";

export type ProviderRow = {
  id: string;
  key: string;
  displayName: string;
  docUrl?: string;
  description?: string;
};
export type DevRow = { id: string; displayName: string };
export type KeyRow = {
  fingerprint: string | null;
  status: string;
  developerName: string;
};

const NEW_DEV = "__new__";

export function ProvidersClient({
  providers,
  developers,
  keysByProvider,
}: {
  providers: ProviderRow[];
  developers: DevRow[];
  keysByProvider: Record<string, KeyRow[]>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          developers={developers}
          keys={keysByProvider[provider.id] ?? []}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  developers,
  keys,
}: {
  provider: ProviderRow;
  developers: DevRow[];
  keys: KeyRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [devChoice, setDevChoice] = React.useState<string>(
    developers[0]?.id ?? NEW_DEV
  );

  const activeCount = keys.filter((k) => k.status === "active").length;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await connectProviderKey(formData);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{provider.displayName}</CardTitle>
          <Badge variant={activeCount > 0 ? "default" : "secondary"}>
            {activeCount} active {activeCount === 1 ? "key" : "keys"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {keys.length > 0 ? (
          <ul className="mb-3 space-y-1.5">
            {keys.map((k, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2 text-zinc-700">
                  <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="font-mono">···· {k.fingerprint}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="truncate text-zinc-500">
                    {k.developerName}
                  </span>
                </span>
                <Badge
                  variant={k.status === "active" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {k.status}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          provider.description && (
            <p className="mb-3 text-xs text-zinc-500">{provider.description}</p>
          )
        )}

        <div className="flex items-center justify-between gap-3">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-sm font-medium text-paper transition-colors hover:opacity-90">
              <Plus className="mr-1.5 h-4 w-4" />
              Add key
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect {provider.displayName} key</DialogTitle>
              </DialogHeader>
              <form action={handleSubmit} className="space-y-4">
                <input type="hidden" name="providerKey" value={provider.key} />

                <div>
                  <Label htmlFor={`dev-${provider.id}`}>Developer</Label>
                  <select
                    id={`dev-${provider.id}`}
                    value={devChoice}
                    onChange={(e) => setDevChoice(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {developers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.displayName}
                      </option>
                    ))}
                    <option value={NEW_DEV}>+ New developer…</option>
                  </select>
                  {/* Submitted only when an existing developer is chosen. */}
                  <input
                    type="hidden"
                    name="developerId"
                    value={devChoice === NEW_DEV ? "" : devChoice}
                  />
                </div>

                {devChoice === NEW_DEV && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`name-${provider.id}`}>Name</Label>
                      <Input
                        id={`name-${provider.id}`}
                        name="newDeveloperName"
                        required
                        placeholder="Jane Dev"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`email-${provider.id}`}>Email</Label>
                      <Input
                        id={`email-${provider.id}`}
                        name="newDeveloperEmail"
                        type="email"
                        required
                        placeholder="jane@acme.com"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor={`key-${provider.id}`}>API key</Label>
                  <Input
                    id={`key-${provider.id}`}
                    name="apiKey"
                    type="password"
                    required
                    placeholder="sk-..."
                    className="mt-1 font-mono"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Validated with {provider.displayName}, then encrypted (KMS).
                    Only the last 4 characters are stored in readable form.
                  </p>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? "Validating & saving…" : "Save key"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {provider.docUrl && (
            <a
              href={provider.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              Setup help
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
