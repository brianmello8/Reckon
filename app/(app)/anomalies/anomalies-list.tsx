"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Check } from "lucide-react";
import { acknowledgeAnomaly } from "./actions";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type Anomaly = {
  id: string;
  developerId: string;
  developerName: string;
  kind: string;
  severity: string;
  details: unknown;
  detectedAt: Date;
  acknowledgedAt: Date | null;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unacknowledged", label: "Unacknowledged" },
  { key: "acknowledged", label: "Acknowledged" },
];

const severityColor: Record<string, "default" | "secondary" | "destructive"> = {
  info: "secondary",
  warn: "default",
  critical: "destructive",
};

const kindLabel: Record<string, string> = {
  spike: "Spike",
  sudden_increase: "Sudden increase",
  sustained_increase: "Sustained increase",
};

function getSummary(details: unknown): string {
  const d = details as Record<string, unknown> | null;
  if (!d) return "";
  if (d.multiple) return `${d.multiple}x typical spend`;
  return "";
}

export function AnomaliesList({
  anomalies,
  currentFilter,
}: {
  anomalies: Anomaly[];
  currentFilter: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleAck(id: string) {
    startTransition(async () => {
      try {
        await acknowledgeAnomaly(id);
        toast.success("Anomaly acknowledged");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={currentFilter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => router.push(`/anomalies?filter=${f.key}`)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {anomalies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <AlertTriangle className="h-10 w-10 text-zinc-400" />
          <h3 className="mt-4 text-sm font-medium text-zinc-900">
            No anomalies
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            {currentFilter === "all"
              ? "No anomalies detected yet. They'll appear here when unusual spending is found."
              : `No ${currentFilter} anomalies.`}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Detected</TableHead>
                <TableHead>Developer</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomalies.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-zinc-600">
                    {formatDistanceToNow(a.detectedAt, { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/developers/${a.developerId}`}
                      className="font-medium hover:underline"
                    >
                      {a.developerName}
                    </Link>
                  </TableCell>
                  <TableCell>{kindLabel[a.kind] ?? a.kind}</TableCell>
                  <TableCell>
                    <Badge variant={severityColor[a.severity] ?? "secondary"}>
                      {a.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-600">
                    {getSummary(a.details)}
                  </TableCell>
                  <TableCell>
                    {a.acknowledgedAt ? (
                      <span className="flex items-center gap-1 text-sm text-green-600">
                        <Check className="h-3 w-3" />
                        Acked
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-500">Open</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!a.acknowledgedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleAck(a.id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
