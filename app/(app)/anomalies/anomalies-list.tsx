"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { acknowledgeAnomaly } from "./actions";
import {
  Segmented,
  SeverityBadge,
  Avatar,
} from "@/components/reckon/primitives";

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
  { value: "all", label: "All" },
  { value: "unacknowledged", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
];

const kindLabel: Record<string, string> = {
  spike: "spike",
  sudden_increase: "sudden increase",
  sustained_increase: "sustained increase",
};

function severityBar(s: string): string {
  if (s === "critical") return "var(--sev-crit)";
  if (s === "warn") return "var(--sev-warn)";
  return "var(--sev-info)";
}

function multipleOf(details: unknown): number | null {
  const d = details as Record<string, unknown> | null;
  return d?.multiple != null ? Number(d.multiple) : null;
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
      <div className="mb-4">
        <Segmented
          options={FILTERS}
          value={currentFilter}
          onChange={(v) => router.push(`/anomalies?filter=${v}`)}
        />
      </div>

      {anomalies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-2 bg-paper py-16">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--pos)_14%,transparent)]">
            <CheckCircle2 className="h-6 w-6 text-pos" />
          </span>
          <h3 className="mt-4 text-[14px] font-medium text-ink">All clear</h3>
          <p className="mt-1 text-[13px] text-ink-3">
            {currentFilter === "all"
              ? "No anomalies detected yet."
              : `No ${currentFilter} anomalies.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {anomalies.map((a, i) => {
            const acked = !!a.acknowledgedAt;
            const mult = multipleOf(a.details);
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm transition-opacity"
                style={{ opacity: acked ? 0.72 : 1 }}
              >
                <div className="flex gap-4 p-4">
                  <span
                    className="-my-4 -ml-4 w-1 shrink-0"
                    style={{ background: severityBar(a.severity) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={a.severity as "info" | "warn" | "critical"} />
                      <span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">
                        {kindLabel[a.kind] ?? a.kind}
                      </span>
                      <span className="text-[12px] text-ink-3">
                        {formatDistanceToNow(a.detectedAt, { addSuffix: true })}
                      </span>
                    </div>

                    {mult != null && (
                      <div className="mono mt-2 text-[22px] font-semibold text-ink">
                        {mult}×
                        <span className="ml-2 text-[13px] font-normal text-ink-3">
                          above baseline
                        </span>
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <Avatar name={a.developerName} size={22} hue={(i * 47) % 360} />
                      <Link
                        href={`/developers/${a.developerId}`}
                        className="text-[13px] font-medium text-ink hover:underline"
                      >
                        {a.developerName}
                      </Link>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start">
                    {acked ? (
                      <span className="inline-flex items-center gap-1 text-[12.5px] text-pos">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAck(a.id)}
                        disabled={pending}
                        className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12.5px] font-medium text-paper hover:opacity-90 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
