"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createCodeSetAction, deleteCodeSetAction, upsertMappingAction } from "./actions";

type Segment = "gl_account" | "cost_center" | "entity" | "project" | "product_line";
type MatrixValue = { id: string; code: string; name: string; mappedCode: string | null; validated: boolean; usedInApprovedJe: boolean };
type MatrixSeg = { segment: Segment; appliesToJe: boolean; options: { code: string; name: string | null }[]; values: MatrixValue[] };
type View = {
  codeSets: { id: string; label: string; uploadedAt: string; counts: Record<string, number> }[];
  selectedCodeSetId: string | null;
  matrix: MatrixSeg[];
  unmappedUsed: { segment: string; code: string; name: string }[];
};

const SEG_LABEL: Record<Segment, string> = {
  gl_account: "GL account",
  cost_center: "Cost center",
  entity: "Entity",
  project: "Project",
  product_line: "Product line",
};
const selectCls = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

/** Minimal CSV parse (quoted fields supported) — same pattern as Outcomes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

export function ErpCodesClient({ view }: { view: View }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <UploadCard busy={busy} run={run} />

      {/* Code sets */}
      {view.codeSets.length > 0 && (
        <div className="rounded-xl border border-line bg-paper p-4">
          <div className="font-semibold text-ink">Uploaded code sets</div>
          <div className="mt-3 overflow-hidden rounded-lg border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
                <tr><th className="px-3 py-1.5 font-medium">Code set</th><th className="px-3 py-1.5 font-medium">Codes</th><th className="px-3 py-1.5 font-medium">Uploaded</th><th className="px-3 py-1.5"></th></tr>
              </thead>
              <tbody>
                {view.codeSets.map((s) => (
                  <tr key={s.id} className={`border-t border-line ${s.id === view.selectedCodeSetId ? "bg-bg-2/50" : ""}`}>
                    <td className="px-3 py-1.5 text-ink-2">
                      {s.label}{s.id === view.selectedCodeSetId && <span className="ml-2 text-[11px] text-brand">mapping ↓</span>}
                    </td>
                    <td className="px-3 py-1.5 text-[12px] text-ink-3">
                      {Object.entries(s.counts).map(([seg, n]) => `${SEG_LABEL[seg as Segment] ?? seg}: ${n}`).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[12px] text-ink-3">{new Date(s.uploadedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-3">
                        {s.id !== view.selectedCodeSetId && (
                          <button className="text-[12px] text-ink-3 hover:text-ink" onClick={() => router.push(`${pathname}?codeSet=${s.id}`)}>map this</button>
                        )}
                        <button className="text-[12px] text-ink-3 hover:text-red-500" disabled={busy}
                          onClick={() => { if (confirm(`Delete code set "${s.label}" and its mappings?`)) run(() => deleteCodeSetAction(s.id), "Code set deleted"); }}>
                          delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unmapped-but-used flag */}
      {view.unmappedUsed.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="font-semibold text-ink">{view.unmappedUsed.length} dimension value(s) used in approved JEs have no mapping</div>
          <p className="mt-0.5 text-[12.5px] text-ink-3">These export with Reckon&apos;s code and are flagged needs-mapping — you can&apos;t export a real code you haven&apos;t mapped.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {view.unmappedUsed.map((u, i) => (
              <Badge key={i} variant="secondary">{SEG_LABEL[u.segment as Segment] ?? u.segment}: {u.code}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Mapping matrix */}
      {view.selectedCodeSetId ? (
        view.matrix.filter((m) => m.values.length > 0).map((m) => (
          <MappingTable key={m.segment} seg={m} codeSetId={view.selectedCodeSetId!} busy={busy} run={run} />
        ))
      ) : (
        <p className="text-sm text-ink-3">Upload a code set above to start mapping Reckon dimensions to your real codes.</p>
      )}
    </div>
  );
}

function UploadCard({ busy, run }: { busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [segment, setSegment] = React.useState<Segment>("gl_account");
  const [label, setLabel] = React.useState("");
  const [parsed, setParsed] = React.useState<{ rows: { code: string; name: string }[]; error: string | null } | null>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result));
        if (rows.length < 2) throw new Error("CSV needs a header row + at least one data row.");
        const header = rows[0].map((h) => h.trim().toLowerCase());
        const find = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
        const codeIdx = find(["code", "account", "number", "id"]);
        const nameIdx = find(["name", "description", "label", "title"]);
        if (codeIdx < 0) throw new Error("Couldn't find a code/account column.");
        const out = rows.slice(1).map((r) => ({ code: (r[codeIdx] ?? "").trim(), name: nameIdx >= 0 ? (r[nameIdx] ?? "").trim() : "" })).filter((r) => r.code);
        if (out.length === 0) throw new Error("No code rows found.");
        setParsed({ rows: out, error: null });
      } catch (err) {
        setParsed({ rows: [], error: err instanceof Error ? err.message : "Parse failed" });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="font-semibold text-ink">Upload codes</div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">Upload one segment per file (e.g. your chart of accounts). Columns auto-detected: a code/account column, and an optional name column.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Label<Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="NetSuite production CoA" className="w-56" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Segment
          <select className={selectCls} value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
            {(Object.keys(SEG_LABEL) as Segment[]).map((s) => <option key={s} value={s}>{SEG_LABEL[s]}</option>)}
          </select>
        </label>
        <input type="file" accept=".csv,text/csv"
          className="text-[12px] text-ink-3 file:mr-2 file:rounded-md file:border file:border-line file:bg-bg-2 file:px-2 file:py-1 file:text-[12px]"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {parsed?.error && <p className="mt-2 text-[12px] text-red-500">{parsed.error}</p>}
      {parsed && !parsed.error && (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[12px] text-ink-3">{parsed.rows.length} {SEG_LABEL[segment]} code(s) parsed.</span>
          <Button size="sm" disabled={busy || !label.trim()}
            onClick={() => run(() => createCodeSetAction({ systemLabel: label, segment, rows: parsed.rows }).then(() => setParsed(null)), `Uploaded ${parsed.rows.length} codes`)}>
            Upload {parsed.rows.length}
          </Button>
        </div>
      )}
    </div>
  );
}

function MappingTable({ seg, codeSetId, busy, run }: { seg: MatrixSeg; codeSetId: string; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-ink">{SEG_LABEL[seg.segment]}</span>
        {!seg.appliesToJe && <Badge variant="secondary">not used in JE exports</Badge>}
        {seg.options.length === 0 && <span className="text-[12px] text-ink-3">no uploaded codes for this segment</span>}
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-bg-2 text-left text-[12px] text-ink-3">
            <tr><th className="px-3 py-1.5 font-medium">Reckon value</th><th className="px-3 py-1.5 font-medium">Real ERP code</th><th className="px-3 py-1.5 font-medium">Status</th></tr>
          </thead>
          <tbody>
            {seg.values.map((v) => (
              <tr key={v.id} className="border-t border-line">
                <td className="px-3 py-1.5 text-ink-2">
                  <span className="font-mono">{v.code}</span> <span className="text-ink-3">{v.name}</span>
                  {v.usedInApprovedJe && <span className="ml-2 text-[11px] text-ink-3">(in approved JEs)</span>}
                </td>
                <td className="px-3 py-1.5">
                  <select className={`${selectCls} w-64`} disabled={busy || seg.options.length === 0} value={v.mappedCode ?? ""}
                    onChange={(e) => run(() => upsertMappingAction({ codeSetId, reckonDimension: seg.segment, reckonValueId: v.id, erpCode: e.target.value }), e.target.value ? "Mapped" : "Unmapped")}>
                    <option value="">— unmapped —</option>
                    {seg.options.map((o) => <option key={o.code} value={o.code}>{o.code}{o.name ? ` · ${o.name}` : ""}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  {v.mappedCode
                    ? <Badge variant="default">mapped{v.validated ? "" : " (unverified)"}</Badge>
                    : v.usedInApprovedJe
                      ? <Badge variant="secondary">needs mapping</Badge>
                      : <span className="text-[12px] text-ink-3">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
