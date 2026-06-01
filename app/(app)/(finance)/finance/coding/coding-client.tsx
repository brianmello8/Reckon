"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, microsToDollars } from "@/lib/reckon/format";
import { COGS_CONFIRM_REQUIRED } from "@/lib/finance/constants";
import {
  saveRule,
  setRuleActive,
  deleteRule,
  codeGroup,
  recomputeAllocationsAction,
} from "./actions";

type Opt = { id: string; label: string };
type GlOpt = Opt & { accountType: string };
type Rule = {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  match: Record<string, string>;
  assign: Record<string, string>;
};
type Group = {
  providerName: string;
  model: string;
  agentName: string | null;
  eventCount: number;
  costMicros: number;
  eventIds: string[];
};

type Props = {
  rules: Rule[];
  needsCoding: Group[];
  providers: { key: string; name: string }[];
  agents: { id: string; name: string }[];
  glAccounts: GlOpt[];
  costCenters: Opt[];
  entities: Opt[];
  projects: Opt[];
  productLines: Opt[];
};

const money = (m: number) => fmtMoney(microsToDollars(m));

export function CodingClient(props: Props) {
  const [tab, setTab] = React.useState<"rules" | "queue">("rules");
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["rules", "queue"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? "bg-ink text-paper" : "text-ink-3 hover:bg-bg-2 hover:text-ink"
            }`}
          >
            {t === "rules" ? "Rules" : `Needs coding${props.needsCoding.length ? ` (${props.needsCoding.length})` : ""}`}
          </button>
        ))}
      </div>
      {tab === "rules" ? <RulesTab {...props} /> : <QueueTab {...props} />}
    </div>
  );
}

function RulesTab(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Rule | null>(null);
  const [pending, setPending] = React.useState(false);
  const glLabel = new Map(props.glAccounts.map((g) => [g.id, g.label]));

  async function submit(formData: FormData, confirmCogs = false) {
    setPending(true);
    try {
      const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
      raw.active = formData.get("active") ? "true" : "false";
      await saveRule(raw, confirmCogs);
      toast.success(editing ? "Rule saved" : "Rule created");
      setEditing(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (msg === COGS_CONFIRM_REQUIRED) {
        if (
          window.confirm(
            "This rule assigns spend to a COGS account with a broad match (it isn't narrowed to a model/agent/workflow). Misclassifying opex as COGS distorts gross margin. Activate it anyway?"
          )
        ) {
          await submit(formData, true);
          return;
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setPending(false);
    }
  }

  const formKey = editing?.id ?? "new";

  return (
    <div className="space-y-4">
      <form
        key={formKey}
        action={(fd) => submit(fd)}
        className="space-y-3 rounded-xl border border-line bg-paper p-4"
      >
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div className="flex flex-wrap items-end gap-3">
          <L label="Name"><Input name="name" defaultValue={editing?.name} required className="w-48" /></L>
          <L label="Priority (lower wins)">
            <Input name="priority" type="number" defaultValue={String(editing?.priority ?? 100)} className="w-28" />
          </L>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-2">
            <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} className="h-4 w-4 accent-ink" />
            Active
          </label>
        </div>
        <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Match (all specified must hold)</div>
        <div className="flex flex-wrap items-end gap-3">
          <Select name="provider" label="Provider" defaultValue={editing?.match.provider}
            options={[{ id: "", label: "— any —" }, ...props.providers.map((p) => ({ id: p.key, label: p.name }))]} />
          <L label="Model"><Input name="model" defaultValue={editing?.match.model} placeholder="any" className="w-40" /></L>
          <Select name="agentId" label="Agent" defaultValue={editing?.match.agentId}
            options={[{ id: "", label: "— any —" }, ...props.agents.map((a) => ({ id: a.id, label: a.name }))]} />
        </div>
        <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Assign (fills unset fields)</div>
        <div className="flex flex-wrap items-end gap-3">
          <Select name="gl_account_id" label="GL account" defaultValue={editing?.assign.gl_account_id}
            options={[{ id: "", label: "—" }, ...props.glAccounts]} />
          <Select name="cost_center_id" label="Cost center" defaultValue={editing?.assign.cost_center_id}
            options={[{ id: "", label: "—" }, ...props.costCenters]} />
          <Select name="entity_id" label="Entity" defaultValue={editing?.assign.entity_id}
            options={[{ id: "", label: "—" }, ...props.entities]} />
          <Select name="project_id" label="Project" defaultValue={editing?.assign.project_id}
            options={[{ id: "", label: "—" }, ...props.projects]} />
          <Select name="product_line_id" label="Product line" defaultValue={editing?.assign.product_line_id}
            options={[{ id: "", label: "—" }, ...props.productLines]} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save rule" : "Add rule"}</Button>
          {editing && <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>}
        </div>
      </form>

      {props.rules.length === 0 ? (
        <p className="py-4 text-sm text-zinc-500">No rules yet. Add one above; unmapped spend stays in the Needs coding queue.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Match</th>
                <th className="px-4 py-2 font-medium">GL</th>
                <th className="px-4 py-2 font-medium">Active</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {props.rules.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-mono text-ink-2">{r.priority}</td>
                  <td className="px-4 py-2.5 text-ink">{r.name}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-ink-2">
                    {Object.entries(r.match).map(([k, v]) => `${k}=${v}`).join(", ") || "any"}
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-ink-2">
                    {r.assign.gl_account_id ? glLabel.get(r.assign.gl_account_id) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={async () => {
                        await setRuleActive(r.id, !r.active);
                        router.refresh();
                      }}
                    >
                      <Badge variant={r.active ? "default" : "secondary"}>{r.active ? "active" : "off"}</Badge>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>Edit</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={async () => {
                        if (!confirm("Delete this rule?")) return;
                        await deleteRule(r.id);
                        router.refresh();
                      }}
                    >
                      Delete
                    </Button>
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

function QueueTab(props: Props) {
  const router = useRouter();
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState(false);
  const [recomputing, setRecomputing] = React.useState(false);

  async function code(group: Group, formData: FormData) {
    const gl = formData.get("gl_account_id") as string;
    if (!gl) {
      toast.error("A GL account is required to code.");
      return;
    }
    setPending(true);
    try {
      await codeGroup({
        eventIds: group.eventIds,
        gl_account_id: gl,
        cost_center_id: (formData.get("cost_center_id") as string) || undefined,
        entity_id: (formData.get("entity_id") as string) || undefined,
        project_id: (formData.get("project_id") as string) || undefined,
        product_line_id: (formData.get("product_line_id") as string) || undefined,
      });
      toast.success(`Coded ${group.eventCount} event(s)`);
      setOpenIdx(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Spend no rule fully coded. Code a group manually — overrides survive recompute. Never auto-guessed.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={recomputing}
          onClick={async () => {
            setRecomputing(true);
            try {
              await recomputeAllocationsAction();
              toast.success("Recompute queued");
            } finally {
              setRecomputing(false);
            }
          }}
        >
          {recomputing ? "Recomputing…" : "Recompute"}
        </Button>
      </div>

      {props.needsCoding.length === 0 ? (
        <p className="py-6 text-sm text-zinc-500">Nothing needs coding 🎉</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Events</th>
                <th className="px-4 py-2 font-medium">Spend</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {props.needsCoding.map((g, i) => (
                <React.Fragment key={i}>
                  <tr className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-ink">{g.providerName}</td>
                    <td className="px-4 py-2.5 text-ink-2">{g.model}</td>
                    <td className="px-4 py-2.5 text-ink-2">{g.agentName ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{g.eventCount}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{money(g.costMicros)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
                        {openIdx === i ? "Cancel" : "Code"}
                      </Button>
                    </td>
                  </tr>
                  {openIdx === i && (
                    <tr className="bg-bg-2/50">
                      <td colSpan={6} className="px-4 py-3">
                        <form action={(fd) => code(g, fd)} className="flex flex-wrap items-end gap-3">
                          <Select name="gl_account_id" label="GL account (required)"
                            options={[{ id: "", label: "—" }, ...props.glAccounts]} />
                          <Select name="cost_center_id" label="Cost center"
                            options={[{ id: "", label: "—" }, ...props.costCenters]} />
                          <Select name="entity_id" label="Entity"
                            options={[{ id: "", label: "—" }, ...props.entities]} />
                          <Select name="project_id" label="Project"
                            options={[{ id: "", label: "—" }, ...props.projects]} />
                          <Select name="product_line_id" label="Product line"
                            options={[{ id: "", label: "—" }, ...props.productLines]} />
                          <Button type="submit" disabled={pending}>{pending ? "Coding…" : "Apply"}</Button>
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-ink-3">
      {label}
      {children}
    </label>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Opt[];
}) {
  return (
    <L label={label}>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-9 w-44 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </L>
  );
}
