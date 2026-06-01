"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  saveDimension,
  setDimensionStatus,
  type DimensionKind,
} from "./actions";

type Row = {
  id: string;
  code: string;
  name: string;
  status: "active" | "archived";
  parentId?: string | null;
  ownerRef?: string | null;
  accountType?: string | null;
  functionalCurrency?: string | null;
};

const GL_TYPES = [
  { value: "cogs", label: "COGS" },
  { value: "opex_rnd", label: "Opex — R&D" },
  { value: "opex_ga", label: "Opex — G&A" },
  { value: "opex_sm", label: "Opex — S&M" },
  { value: "other", label: "Other" },
];

const TABS: { kind: DimensionKind; label: string }[] = [
  { kind: "cost_center", label: "Cost centers" },
  { kind: "gl_account", label: "GL accounts" },
  { kind: "project", label: "Projects" },
  { kind: "entity", label: "Entities" },
  { kind: "product_line", label: "Product lines" },
];

export function DimensionsClient(props: {
  costCenters: Row[];
  glAccounts: Row[];
  projects: Row[];
  entities: Row[];
  productLines: Row[];
}) {
  const [tab, setTab] = React.useState<DimensionKind>("cost_center");
  const dataByKind: Record<DimensionKind, Row[]> = {
    cost_center: props.costCenters,
    gl_account: props.glAccounts,
    project: props.projects,
    entity: props.entities,
    product_line: props.productLines,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setTab(t.kind)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.kind
                ? "bg-ink text-paper"
                : "text-ink-3 hover:bg-bg-2 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <DimensionPanel kind={tab} rows={dataByKind[tab]} costCenters={props.costCenters} />
    </div>
  );
}

function DimensionPanel({
  kind,
  rows,
  costCenters,
}: {
  kind: DimensionKind;
  rows: Row[];
  costCenters: Row[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [pending, setPending] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
      await saveDimension(kind, raw);
      toast.success(editing ? "Updated" : "Created");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function toggleStatus(r: Row) {
    setBusyId(r.id);
    try {
      await setDimensionStatus(kind, r.id, r.status === "active" ? "archived" : "active");
      toast.success(r.status === "active" ? "Archived" : "Restored");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  // form key forces remount (clears inputs) when switching between add/edit.
  const formKey = editing?.id ?? "new";

  return (
    <div className="space-y-4">
      <form
        key={formKey}
        action={handleSubmit}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-paper p-3"
      >
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <Field name="code" label="Code" defaultValue={editing?.code} required />
        <Field name="name" label="Name" defaultValue={editing?.name} required wide />

        {kind === "cost_center" && (
          <>
            <SelectField
              name="parentId"
              label="Parent"
              defaultValue={editing?.parentId ?? ""}
              options={[
                { value: "", label: "— none —" },
                ...costCenters
                  .filter((c) => c.id !== editing?.id && c.status === "active")
                  .map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
              ]}
            />
            <Field name="ownerRef" label="Owner (optional)" defaultValue={editing?.ownerRef ?? ""} />
          </>
        )}
        {kind === "gl_account" && (
          <SelectField
            name="accountType"
            label="Account type"
            defaultValue={editing?.accountType ?? "other"}
            options={GL_TYPES}
          />
        )}
        {kind === "entity" && (
          <Field
            name="functionalCurrency"
            label="Currency (ISO)"
            defaultValue={editing?.functionalCurrency ?? "USD"}
            required
          />
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save" : "Add"}
        </Button>
        {editing && (
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        )}
      </form>

      {kind === "cost_center" ? (
        <CostCenterTree
          rows={rows}
          busyId={busyId}
          onEdit={setEditing}
          onToggle={toggleStatus}
        />
      ) : (
        <FlatTable
          kind={kind}
          rows={rows}
          busyId={busyId}
          onEdit={setEditing}
          onToggle={toggleStatus}
        />
      )}
    </div>
  );
}

function CostCenterTree({
  rows,
  busyId,
  onEdit,
  onToggle,
}: {
  rows: Row[];
  busyId: string | null;
  onEdit: (r: Row) => void;
  onToggle: (r: Row) => void;
}) {
  const childrenOf = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.parentId ?? "__root__";
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(r);
  }
  const sortRows = (a: Row, b: Row) => a.code.localeCompare(b.code);

  const render = (parentKey: string, depth: number): React.ReactNode =>
    (childrenOf.get(parentKey) ?? []).sort(sortRows).map((r) => (
      <React.Fragment key={r.id}>
        <tr className="border-b border-line last:border-0">
          <td className="px-4 py-2.5">
            <span style={{ paddingLeft: depth * 18 }} className="inline-flex items-center gap-2">
              {depth > 0 && <span className="text-ink-3">└</span>}
              <span className="font-mono text-[12.5px] text-ink-2">{r.code}</span>
              <span className="text-ink">{r.name}</span>
            </span>
          </td>
          <td className="px-4 py-2.5 text-ink-3">{r.ownerRef ?? "—"}</td>
          <td className="px-4 py-2.5">
            <StatusBadge status={r.status} />
          </td>
          <RowActions r={r} busyId={busyId} onEdit={onEdit} onToggle={onToggle} />
        </tr>
        {render(r.id, depth + 1)}
      </React.Fragment>
    ));

  if (rows.length === 0) return <Empty />;
  return (
    <TableShell head={["Cost center", "Owner", "Status", ""]}>
      {render("__root__", 0)}
    </TableShell>
  );
}

function FlatTable({
  kind,
  rows,
  busyId,
  onEdit,
  onToggle,
}: {
  kind: DimensionKind;
  rows: Row[];
  busyId: string | null;
  onEdit: (r: Row) => void;
  onToggle: (r: Row) => void;
}) {
  if (rows.length === 0) return <Empty />;
  const extraHead =
    kind === "gl_account" ? "Type" : kind === "entity" ? "Currency" : null;
  const glLabel = (t?: string | null) =>
    GL_TYPES.find((g) => g.value === t)?.label ?? t ?? "—";
  return (
    <TableShell head={["Code", "Name", ...(extraHead ? [extraHead] : []), "Status", ""]}>
      {[...rows]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((r) => (
          <tr key={r.id} className="border-b border-line last:border-0">
            <td className="px-4 py-2.5 font-mono text-[12.5px] text-ink-2">{r.code}</td>
            <td className="px-4 py-2.5 text-ink">{r.name}</td>
            {extraHead && (
              <td className="px-4 py-2.5 text-ink-2">
                {kind === "gl_account" ? glLabel(r.accountType) : r.functionalCurrency}
              </td>
            )}
            <td className="px-4 py-2.5">
              <StatusBadge status={r.status} />
            </td>
            <RowActions r={r} busyId={busyId} onEdit={onEdit} onToggle={onToggle} />
          </tr>
        ))}
    </TableShell>
  );
}

function RowActions({
  r,
  busyId,
  onEdit,
  onToggle,
}: {
  r: Row;
  busyId: string | null;
  onEdit: (r: Row) => void;
  onToggle: (r: Row) => void;
}) {
  return (
    <td className="px-4 py-2.5 text-right">
      <Button variant="ghost" size="sm" onClick={() => onEdit(r)} disabled={busyId === r.id}>
        Edit
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onToggle(r)} disabled={busyId === r.id}>
        {r.status === "active" ? "Archive" : "Restore"}
      </Button>
    </td>
  );
}

function TableShell({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "archived" }) {
  return (
    <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
  wide,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-ink-3">
      {label}
      <Input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className={wide ? "w-56" : "w-36"}
      />
    </label>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-ink-3">
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 w-44 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty() {
  return <p className="py-6 text-sm text-zinc-500">None yet. Add one above.</p>;
}
