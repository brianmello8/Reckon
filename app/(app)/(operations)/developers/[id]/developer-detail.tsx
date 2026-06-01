"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Key, ArrowLeft, RefreshCw } from "lucide-react";
import { revokeProviderKey, repollKey } from "./actions";
import { assignDeveloperToAgent } from "../../providers/actions";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import Link from "next/link";

type ProviderKey = {
  id: string;
  providerDisplayName: string;
  providerSlug: string;
  keyFingerprint: string;
  status: "active" | "errored" | "revoked";
  lastPolledAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

type Developer = {
  id: string;
  displayName: string;
  email: string;
  agentId: string | null;
  createdAt: Date;
};

type AgentRow = { id: string; name: string; status: "active" | "archived" };

const NEW_AGENT = "__new__";

export function DeveloperDetail({
  developer,
  keys,
  agents,
}: {
  developer: Developer;
  keys: ProviderKey[];
  agents: AgentRow[];
}) {
  const router = useRouter();
  const [revokePending, startRevokeTransition] = useTransition();
  const [repollPending, startRepollTransition] = useTransition();
  const [agentPending, startAgentTransition] = useTransition();

  function handleAssignAgent(value: string) {
    const fd = new FormData();
    fd.set("developerId", developer.id);
    if (value === NEW_AGENT) {
      const name = window.prompt("New agent name");
      if (!name || !name.trim()) return;
      fd.set("newAgentName", name.trim());
    } else {
      fd.set("agentId", value);
    }
    startAgentTransition(async () => {
      try {
        await assignDeveloperToAgent(fd);
        toast.success("Agent mapping updated — recomputing attribution");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function handleRepoll(keyId: string) {
    startRepollTransition(async () => {
      try {
        await repollKey(keyId);
        toast.success("Re-poll triggered");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to trigger re-poll"
        );
      }
    });
  }

  function handleRevoke(keyId: string) {
    startRevokeTransition(async () => {
      try {
        await revokeProviderKey(keyId);
        toast.success("Key revoked");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to revoke key"
        );
      }
    });
  }

  const statusColor = {
    active: "default" as const,
    errored: "destructive" as const,
    revoked: "secondary" as const,
  };

  function isBackfilling(key: ProviderKey) {
    return (
      key.status === "active" &&
      !key.lastPolledAt &&
      differenceInMinutes(new Date(), key.createdAt) < 30
    );
  }

  return (
    <div>
      <Link
        href="/developers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to developers
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {developer.displayName}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">{developer.email}</p>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 max-w-prose text-sm text-zinc-600">
            Attribute this developer&apos;s spend to an agent. A per-identity
            agent mapping on the{" "}
            <Link
              href="/providers"
              className="font-medium text-zinc-900 underline"
            >
              Providers
            </Link>{" "}
            page takes precedence over this.
          </p>
          <select
            value={developer.agentId ?? ""}
            disabled={agentPending}
            onChange={(e) => handleAssignAgent(e.target.value)}
            className="h-9 w-full max-w-[280px] rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
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
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Provider keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Key className="h-8 w-8 text-zinc-400" />
              <p className="mt-2 max-w-sm text-sm text-zinc-600">
                Keys are connected per provider on the{" "}
                <Link
                  href="/providers"
                  className="font-medium text-zinc-900 underline"
                >
                  Providers
                </Link>{" "}
                page. This developer&apos;s spend is attributed automatically
                from the provider&apos;s usage breakdown.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Fingerprint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last polled</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">
                        {key.providerDisplayName}
                      </TableCell>
                      <TableCell className="font-mono text-zinc-600">
                        ...{key.keyFingerprint}
                      </TableCell>
                      <TableCell>
                        {isBackfilling(key) ? (
                          <Badge variant="outline" className="animate-pulse">
                            Backfilling...
                          </Badge>
                        ) : (
                          <Badge variant={statusColor[key.status]}>
                            {key.status}
                          </Badge>
                        )}
                        {key.lastError && key.status === "errored" && (
                          <p className="mt-1 max-w-xs truncate text-xs text-red-600">
                            {key.lastError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-zinc-600">
                        {key.lastPolledAt
                          ? formatDistanceToNow(key.lastPolledAt, {
                              addSuffix: true,
                            })
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        {key.status === "active" && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={repollPending}
                              onClick={() => handleRepoll(key.id)}
                            >
                              <RefreshCw className="mr-1 h-3 w-3" />
                              Re-poll
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={revokePending}
                              onClick={() => handleRevoke(key.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Revoke
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
