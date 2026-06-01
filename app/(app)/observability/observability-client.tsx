"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Plug } from "lucide-react";
import {
  addObservabilityConnection,
  testObservabilityConnection,
  setObservabilityEnabled,
  pollObservabilityNow,
  removeObservabilityConnection,
} from "./actions";

type Provider = "langfuse" | "helicone";
type ConnectionRow = {
  id: string;
  provider: Provider;
  baseUrl: string;
  status: "active" | "error" | "disabled";
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

const PROVIDER_META: Record<
  Provider,
  { name: string; docUrl: string; blurb: string }
> = {
  langfuse: {
    name: "Langfuse",
    docUrl: "https://langfuse.com/docs/api",
    blurb:
      "Create a pair of API keys (Project Settings → API Keys). We read traces and generation metadata only.",
  },
  helicone: {
    name: "Helicone",
    docUrl: "https://docs.helicone.ai/rest/request/post-v1requestquery",
    blurb:
      "Create an API key (Settings → API Keys). We read request metadata only, grouped into runs by session id.",
  },
};

const statusVariant = {
  active: "default" as const,
  error: "destructive" as const,
  disabled: "secondary" as const,
};

export function ObservabilityClient({
  connections,
}: {
  connections: ConnectionRow[];
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
          <ConnectCard key={p} provider={p} />
        ))}
      </div>

      <ConnectionList connections={connections} />
    </div>
  );
}

function ConnectCard({ provider }: { provider: Provider }) {
  const router = useRouter();
  const meta = PROVIDER_META[provider];
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleAdd(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await addObservabilityConnection(formData);
      setOpen(false);
      toast.success(`${meta.name} connected — polling now.`);
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
        <CardTitle className="text-lg">{meta.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-zinc-500">{meta.blurb}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-sm font-medium text-paper transition-colors hover:opacity-90">
            <Plug className="mr-1.5 h-4 w-4" />
            Connect {meta.name}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect {meta.name}</DialogTitle>
            </DialogHeader>
            <form action={handleAdd} className="space-y-4">
              <input type="hidden" name="provider" value={provider} />
              {provider === "langfuse" ? (
                <>
                  <Field
                    name="publicKey"
                    label="Public key"
                    placeholder="pk-lf-..."
                  />
                  <Field
                    name="secretKey"
                    label="Secret key"
                    placeholder="sk-lf-..."
                    secret
                  />
                  <Field
                    name="baseUrl"
                    label="Base URL (self-hosted only)"
                    placeholder="https://cloud.langfuse.com"
                    optional
                  />
                </>
              ) : (
                <>
                  <Field
                    name="apiKey"
                    label="API key"
                    placeholder="sk-helicone-..."
                    secret
                  />
                  <Field
                    name="baseUrl"
                    label="Base URL (override only)"
                    placeholder="https://api.helicone.ai"
                    optional
                  />
                </>
              )}
              <p className="text-xs text-zinc-500">
                Validated, then encrypted (KMS). We never read prompts or
                responses — metadata only.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Validating & saving…" : "Connect"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Field({
  name,
  label,
  placeholder,
  secret,
  optional,
}: {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <Input
        id={`f-${name}`}
        name={name}
        type={secret ? "password" : "text"}
        required={!optional}
        placeholder={placeholder}
        className="mt-1 font-mono"
      />
    </div>
  );
}

function ConnectionList({ connections }: { connections: ConnectionRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    fn()
      .then(() => {
        toast.success(ok);
        router.refresh();
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed")
      )
      .finally(() => setBusyId(null));
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No observability connections yet. Connect Langfuse or Helicone above to
        attribute spend to workflows and runs.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
          <tr>
            <th className="px-4 py-2 font-medium">Tool</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Last synced</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5">
                <div className="font-medium text-ink">
                  {PROVIDER_META[c.provider].name}
                </div>
                <div className="font-mono text-[12px] text-ink-3">
                  {c.baseUrl}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <Badge variant={statusVariant[c.status]}>{c.status}</Badge>
                {c.lastError && c.status === "error" && (
                  <p className="mt-1 max-w-xs truncate text-xs text-red-600">
                    {c.lastError}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-2">
                {c.lastSyncedAt
                  ? new Date(c.lastSyncedAt).toLocaleString()
                  : "Never"}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={() =>
                      run(
                        c.id,
                        () => pollObservabilityNow(c.id),
                        "Poll queued"
                      )
                    }
                  >
                    Poll now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={() =>
                      run(
                        c.id,
                        () => testObservabilityConnection(c.id),
                        "Connection OK"
                      )
                    }
                  >
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={() =>
                      run(
                        c.id,
                        () =>
                          setObservabilityEnabled(
                            c.id,
                            c.status === "disabled"
                          ),
                        c.status === "disabled" ? "Enabled" : "Disabled"
                      )
                    }
                  >
                    {c.status === "disabled" ? "Enable" : "Disable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={() => {
                      if (!confirm("Remove this connection?")) return;
                      run(
                        c.id,
                        () => removeObservabilityConnection(c.id),
                        "Removed"
                      );
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
