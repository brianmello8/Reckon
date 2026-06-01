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
import { ExternalLink, Plug } from "lucide-react";
import {
  connectOrgKey,
  disconnectProvider,
  assignIdentity,
  assignIdentityToAgent,
  recomputeAttributionAction,
} from "./actions";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";

type ProviderRow = {
  id: string;
  key: string;
  displayName: string;
  docUrl?: string;
  description?: string;
  connected: boolean;
  fingerprint: string | null;
  lastPolledAt: string | null;
  lastError: string | null;
};
type DevRow = { id: string; displayName: string };
type AgentRow = { id: string; name: string; status: "active" | "archived" };
type Coverage = {
  totalMicros: string;
  attributedMicros: string;
  unattributedMicros: string;
  coveragePct: number;
};
type IdentityRow = {
  id: string;
  providerId: string;
  providerName: string;
  externalId: string;
  label: string | null;
  developerId: string | null;
  agentId: string | null;
  cost30d: string;
};

export function ProvidersClient({
  providers,
  developers,
  identities,
  agents,
  coverage,
}: {
  providers: ProviderRow[];
  developers: DevRow[];
  identities: IdentityRow[];
  agents: AgentRow[];
  coverage: Coverage;
}) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} />
        ))}
      </div>

      <IdentityMapping
        identities={identities}
        developers={developers}
        agents={agents}
        coverage={coverage}
      />
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConnect(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await connectOrgKey(formData);
      setOpen(false);
      toast.success(`${provider.displayName} connected — pulling usage now.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  function handleDisconnect() {
    if (!confirm(`Disconnect ${provider.displayName}? Usage stops updating.`)) return;
    disconnectProvider(provider.id)
      .then(() => {
        toast.success(`${provider.displayName} disconnected`);
        router.refresh();
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed")
      );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{provider.displayName}</CardTitle>
          <Badge variant={provider.connected ? "default" : "secondary"}>
            {provider.connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {provider.connected ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Org key{" "}
              <span className="font-mono">···· {provider.fingerprint}</span>
              {provider.lastPolledAt && (
                <>
                  {" · "}last synced{" "}
                  {new Date(provider.lastPolledAt).toLocaleString()}
                </>
              )}
            </p>
            {provider.lastError && (
              <p className="text-sm text-red-600">Error: {provider.lastError}</p>
            )}
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {provider.description && (
              <p className="text-xs text-zinc-500">{provider.description}</p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-sm font-medium text-paper transition-colors hover:opacity-90">
                  <Plug className="mr-1.5 h-4 w-4" />
                  Connect
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect {provider.displayName}</DialogTitle>
                  </DialogHeader>
                  <form action={handleConnect} className="space-y-4">
                    <input
                      type="hidden"
                      name="providerKey"
                      value={provider.key}
                    />
                    <div>
                      <Label htmlFor={`key-${provider.id}`}>
                        Org admin / usage key
                      </Label>
                      <Input
                        id={`key-${provider.id}`}
                        name="apiKey"
                        type="password"
                        required
                        placeholder={
                          provider.key === "github_copilot"
                            ? "org_name:token"
                            : "sk-..."
                        }
                        className="mt-1 font-mono"
                      />
                      <p className="mt-1 text-xs text-zinc-500">
                        One key for the whole org. Validated, then encrypted
                        (KMS). Usage is attributed to developers automatically.
                      </p>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <Button type="submit" disabled={pending} className="w-full">
                      {pending ? "Validating & saving…" : "Connect"}
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
                  Where do I find this?
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const NEW_AGENT = "__new__";

function IdentityMapping({
  identities,
  developers,
  agents,
  coverage,
}: {
  identities: IdentityRow[];
  developers: DevRow[];
  agents: AgentRow[];
  coverage: Coverage;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pendingAgentId, setPendingAgentId] = React.useState<string | null>(
    null
  );
  const [recomputing, setRecomputing] = React.useState(false);

  async function handleAssign(identity: IdentityRow, developerId: string) {
    setPendingId(identity.id);
    try {
      const fd = new FormData();
      fd.set("providerId", identity.providerId);
      fd.set("externalId", identity.externalId);
      fd.set("developerId", developerId);
      await assignIdentity(fd);
      toast.success("Mapping updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handleAssignAgent(identity: IdentityRow, value: string) {
    const fd = new FormData();
    fd.set("identityId", identity.id);
    if (value === NEW_AGENT) {
      const name = window.prompt("New agent name");
      if (!name || !name.trim()) return;
      fd.set("newAgentName", name.trim());
    } else {
      fd.set("agentId", value);
    }
    setPendingAgentId(identity.id);
    try {
      await assignIdentityToAgent(fd);
      toast.success("Agent mapping updated — recomputing attribution");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPendingAgentId(null);
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    try {
      await recomputeAttributionAction();
      toast.success("Attribution recompute queued");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRecomputing(false);
    }
  }

  if (identities.length === 0) {
    return (
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Developer mapping</h2>
        <p className="mt-1 text-sm text-zinc-500">
          No usage identities discovered yet. Connect a provider and run
          ingestion — developers will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">
            Developer &amp; agent mapping
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Each provider identity (API key, user, or seat) maps to a developer
            and, optionally, an agent. The agent mapping attributes that
            identity&apos;s spend to a workflow/agent; it takes precedence over a
            developer-level agent mapping.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecompute}
          disabled={recomputing}
          className="shrink-0"
        >
          {recomputing ? "Recomputing…" : "Recompute attribution"}
        </Button>
      </div>
      <CoverageBanner coverage={coverage} />
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Identity</th>
              <th className="px-4 py-2 font-medium">Spend · 30d</th>
              <th className="px-4 py-2 font-medium">Developer</th>
              <th className="px-4 py-2 font-medium">Agent</th>
            </tr>
          </thead>
          <tbody>
            {identities.map((idn) => (
              <tr key={idn.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 text-ink-2">{idn.providerName}</td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-[12.5px] text-ink">
                    {idn.label ?? idn.externalId}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-ink-2">
                  {fmtMoney(microsToDollars(Number(idn.cost30d)))}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={idn.developerId ?? ""}
                    disabled={pendingId === idn.id}
                    onChange={(e) => handleAssign(idn, e.target.value)}
                    className="h-8 w-full max-w-[220px] rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {developers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.displayName}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={idn.agentId ?? ""}
                    disabled={pendingAgentId === idn.id}
                    onChange={(e) => handleAssignAgent(idn, e.target.value)}
                    className="h-8 w-full max-w-[220px] rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <option value="">No agent</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.status === "archived" ? " (archived)" : ""}
                      </option>
                    ))}
                    <option value={NEW_AGENT}>+ New agent…</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const total = Number(coverage.totalMicros);
  if (total <= 0) return null;

  const unattributed = Number(coverage.unattributedMicros);
  const pct = coverage.coveragePct;
  // Below 100% there is spend not attributed to any agent — surface it so ROI
  // figures are never quietly understated. Shared keys land here until 8.3.
  const fullyCovered = unattributed <= 0;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <span className="text-ink-2">
        Agent attribution coverage · 30d:{" "}
        <span className="font-medium text-ink">{pct.toFixed(1)}%</span>
      </span>
      {!fullyCovered && (
        <span className="text-ink-3">
          ·{" "}
          <span className="font-medium text-ink-2">
            {fmtMoney(microsToDollars(unattributed))}
          </span>{" "}
          not attributed to any agent (map identities above, or connect
          observability for shared keys)
        </span>
      )}
    </div>
  );
}
