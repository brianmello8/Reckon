"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createMetricAction,
  deleteMetricAction,
  upsertManualValueAction,
  bulkUpsertValuesAction,
  createTokenAction,
  revokeTokenAction,
} from "./actions";

type Grain = "customer" | "product_line" | "workflow" | "org";
type Metric = {
  id: string;
  key: string;
  name: string;
  unit: string;
  grain: Grain;
  direction: string;
  valueCount: number;
};
type Value = {
  id: string;
  metricId: string;
  metricName: string;
  unit: string;
  grain: Grain;
  grainRef: string;
  grainLabel: string;
  periodStart: string;
  periodEnd: string;
  value: string;
  source: string;
};
type Token = {
  id: string;
  name: string;
  tokenPrefix: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
};
type View = {
  metrics: Metric[];
  values: Value[];
  tokens: Token[];
  pickers: {
    workflows: { id: string; name: string }[];
    productLines: { id: string; label: string }[];
    customers: string[];
  };
};

const selectCls = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

/** Minimal CSV parse — handles quoted fields with embedded commas/quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

export function OutcomesClient({ view }: { view: View }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <MetricsCard view={view} busy={busy} act={act} />
      {view.metrics.length > 0 && <ValuesCard view={view} busy={busy} act={act} />}
      <TokensCard view={view} busy={busy} act={act} />
    </div>
  );
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function MetricsCard({
  view,
  busy,
  act,
}: {
  view: View;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="font-semibold text-ink">Metrics</div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Define what you measure. Grain binds each value to a customer, product line, workflow, or the whole org.
      </p>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          act(
            () =>
              createMetricAction({
                key: String(f.get("key")),
                name: String(f.get("name")),
                unit: String(f.get("unit")),
                grain: f.get("grain") as Grain,
                direction: f.get("direction") as "higher_is_better" | "lower_is_better",
              }),
            "Metric saved"
          ).then(() => form.reset());
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Key<Input name="key" required placeholder="usd_revenue" className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Name<Input name="name" required placeholder="Revenue" className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Unit<Input name="unit" required placeholder="usd_revenue" className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Grain
          <select name="grain" className={selectCls} defaultValue="customer">
            <option value="customer">customer</option>
            <option value="product_line">product line</option>
            <option value="workflow">workflow</option>
            <option value="org">org</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Direction
          <select name="direction" className={selectCls} defaultValue="higher_is_better">
            <option value="higher_is_better">higher is better</option>
            <option value="lower_is_better">lower is better</option>
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy}>Add metric</Button>
      </form>

      {view.metrics.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-1.5 font-medium">Key</th>
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="px-3 py-1.5 font-medium">Unit</th>
                <th className="px-3 py-1.5 font-medium">Grain</th>
                <th className="px-3 py-1.5 font-medium">Direction</th>
                <th className="px-3 py-1.5 text-right font-medium">Values</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {view.metrics.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-3 py-1.5 font-mono text-ink-2">{m.key}</td>
                  <td className="px-3 py-1.5 text-ink-2">{m.name}</td>
                  <td className="px-3 py-1.5 text-ink-3">{m.unit}</td>
                  <td className="px-3 py-1.5"><Badge variant="secondary">{m.grain}</Badge></td>
                  <td className="px-3 py-1.5 text-ink-3">{m.direction.replace(/_/g, " ")}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-ink-2">{m.valueCount}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      className="text-[12px] text-ink-3 hover:text-red-500"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Delete metric "${m.name}" and its ${m.valueCount} value(s)?`))
                          act(() => deleteMetricAction(m.id), "Metric deleted");
                      }}
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Values (manual + CSV) ──────────────────────────────────────────────────────
function ValuesCard({
  view,
  busy,
  act,
}: {
  view: View;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [metricId, setMetricId] = React.useState(view.metrics[0]?.id ?? "");
  const metric = view.metrics.find((m) => m.id === metricId);
  const grain = metric?.grain ?? "org";

  // Plain render helper (not a component) so state isn't reset each render.
  function grainRefField() {
    if (grain === "org") return <span className="text-[12px] text-ink-3">— (org-wide)</span>;
    if (grain === "workflow")
      return (
        <select name="grainRef" className={selectCls} required>
          <option value="">Select workflow…</option>
          {view.pickers.workflows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      );
    if (grain === "product_line")
      return (
        <select name="grainRef" className={selectCls} required>
          <option value="">Select product line…</option>
          {view.pickers.productLines.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      );
    // customer — free text with datalist of known refs
    return (
      <>
        <Input name="grainRef" list="customer-refs" required placeholder="customer ref" className="w-44" />
        <datalist id="customer-refs">
          {view.pickers.customers.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="font-semibold text-ink">Values</div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Load outcome values per period. Re-loading the same period overwrites (idempotent).
      </p>

      <label className="mt-3 flex flex-col gap-1 text-[12px] text-ink-3">
        Metric
        <select
          className={`${selectCls} w-72`}
          value={metricId}
          onChange={(e) => setMetricId(e.target.value)}
        >
          {view.metrics.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.grain})
            </option>
          ))}
        </select>
      </label>

      {/* Manual entry */}
      <form
        key={metricId}
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          act(
            () =>
              upsertManualValueAction({
                metricId,
                grainRef: String(f.get("grainRef") ?? ""),
                periodStart: String(f.get("periodStart")),
                periodEnd: String(f.get("periodEnd")),
                value: String(f.get("value")),
              }),
            "Value saved"
          ).then(() => form.reset());
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          {grain === "org" ? "Scope" : grain.replace(/_/g, " ")}
          {grainRefField()}
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Period start<Input name="periodStart" type="date" required className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Period end<Input name="periodEnd" type="date" required className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Value<Input name="value" required placeholder="1200.50" className="w-32" />
        </label>
        <Button type="submit" size="sm" disabled={busy || !metricId}>Save value</Button>
      </form>

      {/* CSV upload */}
      <CsvUpload metricId={metricId} grain={grain} busy={busy} act={act} />

      {/* Recent values */}
      {view.values.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-1.5 font-medium">Metric</th>
                <th className="px-3 py-1.5 font-medium">Bound to</th>
                <th className="px-3 py-1.5 font-medium">Period</th>
                <th className="px-3 py-1.5 text-right font-medium">Value</th>
                <th className="px-3 py-1.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {view.values.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-2">{v.metricName}</td>
                  <td className="px-3 py-1.5 text-ink-2">{v.grainLabel}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px] text-ink-3">{v.periodStart}…{v.periodEnd}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-ink-2">{v.value}</td>
                  <td className="px-3 py-1.5"><Badge variant="secondary">{v.source}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CsvUpload({
  metricId,
  grain,
  busy,
  act,
}: {
  metricId: string;
  grain: Grain;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [preview, setPreview] = React.useState<{ rows: { grainRef: string; periodStart: string; periodEnd: string; value: string }[]; error: string | null } | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result));
        if (parsed.length < 2) throw new Error("CSV needs a header row + at least one data row.");
        const header = parsed[0].map((h) => h.trim().toLowerCase());
        const col = (names: string[]) => header.findIndex((h) => names.includes(h));
        const refIdx = col(["grain_ref", "grainref", "ref", "customer", "workflow", "product_line"]);
        const startIdx = col(["period_start", "start", "period"]);
        const endIdx = col(["period_end", "end"]);
        const valIdx = col(["value", "amount", "outcome"]);
        if (startIdx < 0 || endIdx < 0 || valIdx < 0)
          throw new Error("Need columns: period_start, period_end, value (grain_ref for non-org grains).");
        const rows = parsed.slice(1).map((r) => ({
          grainRef: refIdx >= 0 ? (r[refIdx] ?? "").trim() : "",
          periodStart: (r[startIdx] ?? "").trim(),
          periodEnd: (r[endIdx] ?? "").trim(),
          value: (r[valIdx] ?? "").trim(),
        }));
        setPreview({ rows, error: null });
      } catch (err) {
        setPreview({ rows: [], error: err instanceof Error ? err.message : "Parse failed" });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-line bg-bg-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] font-medium text-ink">CSV upload</span>
        <span className="text-[11.5px] text-ink-3">
          columns: {grain === "org" ? "" : "grain_ref, "}period_start, period_end, value
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-[12px] text-ink-3 file:mr-2 file:rounded-md file:border file:border-line file:bg-paper file:px-2 file:py-1 file:text-[12px]"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
      {preview?.error && <p className="mt-2 text-[12px] text-red-500">{preview.error}</p>}
      {preview && !preview.error && (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[12px] text-ink-3">{preview.rows.length} row(s) parsed.</span>
          <Button
            size="sm"
            disabled={busy || !metricId}
            onClick={() =>
              act(
                () => bulkUpsertValuesAction({ metricId, rows: preview.rows }).then(() => setPreview(null)),
                `Imported ${preview.rows.length} value(s)`
              )
            }
          >
            Import {preview.rows.length}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── API tokens ──────────────────────────────────────────────────────────────────
function TokensCard({
  view,
  busy,
  act,
}: {
  view: View;
  busy: boolean;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [minted, setMinted] = React.useState<string | null>(null);

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="font-semibold text-ink">API ingest tokens</div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Push outcome values programmatically: <code className="font-mono">POST /api/ingest/outcomes</code> with{" "}
        <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>. Tokens are scoped to your org.
      </p>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          const name = String(f.get("name"));
          act(async () => {
            const res = await createTokenAction(name);
            setMinted(res.plaintext);
          }, "Token created").then(() => form.reset());
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Name<Input name="name" required placeholder="CI pipeline" className="w-56" />
        </label>
        <Button type="submit" size="sm" disabled={busy}>Create token</Button>
      </form>

      {minted && (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand/5 p-3">
          <div className="text-[12.5px] font-medium text-ink">Copy this token now — it won&apos;t be shown again.</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="block flex-1 overflow-x-auto rounded bg-bg-2 px-2 py-1.5 font-mono text-[12px] text-ink">
              {minted}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard?.writeText(minted);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMinted(null)}>Done</Button>
          </div>
        </div>
      )}

      {view.tokens.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="px-3 py-1.5 font-medium">Token</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
                <th className="px-3 py-1.5 font-medium">Last used</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {view.tokens.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-2">{t.name}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px] text-ink-3">{t.tokenPrefix}…</td>
                  <td className="px-3 py-1.5">
                    <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-ink-3">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {t.status === "active" && (
                      <button
                        className="text-[12px] text-ink-3 hover:text-red-500"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`Revoke token "${t.name}"?`)) act(() => revokeTokenAction(t.id), "Token revoked");
                        }}
                      >
                        revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
