"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Key, ArrowLeft, RefreshCw } from "lucide-react";
import { addProviderKey, revokeProviderKey, repollKey } from "./actions";
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

type Provider = {
  id: string;
  key: string;
  displayName: string;
};

type Developer = {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
};

export function DeveloperDetail({
  developer,
  keys,
  providers,
}: {
  developer: Developer;
  keys: ProviderKey[];
  providers: Provider[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addPending, startAddTransition] = useTransition();
  const [revokePending, startRevokeTransition] = useTransition();
  const [repollPending, startRepollTransition] = useTransition();

  function handleAddKey(formData: FormData) {
    startAddTransition(async () => {
      try {
        await addProviderKey(formData);
        toast.success("Provider key added");
        setAddOpen(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to add key"
        );
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {developer.displayName}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">{developer.email}</p>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Provider Keys</CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add provider key</DialogTitle>
              </DialogHeader>
              <form action={handleAddKey} className="space-y-4">
                <input type="hidden" name="developerId" value={developer.id} />
                <div>
                  <Label htmlFor="providerKey">Provider</Label>
                  <select
                    id="providerKey"
                    name="providerKey"
                    required
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select a provider...</option>
                    {providers.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="apiKey">API key</Label>
                  <Input
                    id="apiKey"
                    name="apiKey"
                    type="password"
                    required
                    placeholder="sk-..."
                    className="mt-1 font-mono"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    The key will be validated, encrypted, and stored securely.
                    Only the last 4 characters are visible after saving.
                  </p>
                </div>
                <Button type="submit" disabled={addPending} className="w-full">
                  {addPending ? "Validating & saving..." : "Save key"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <Key className="h-8 w-8 text-zinc-400" />
              <p className="mt-2 text-sm text-zinc-600">
                No provider keys yet. Add one to start tracking usage.
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
                          <p className="mt-1 text-xs text-red-600 max-w-xs truncate">
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
