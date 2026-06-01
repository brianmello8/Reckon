import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getRules, getNeedsCoding, getRuleOptions } from "./actions";
import { getDimensions } from "../dimensions/actions";
import { CodingClient } from "./coding-client";

export default async function CodingPage() {
  await requireSurface("finance");
  const [rules, needsCoding, options, dims] = await Promise.all([
    getRules(),
    getNeedsCoding(),
    getRuleOptions(),
    getDimensions(),
  ]);

  const active = <T extends { status: string }>(xs: T[]) =>
    xs.filter((x) => x.status === "active");

  return (
    <div>
      <PageHead
        title="Coding"
        sub="Map usage to finance dimensions with ordered rules, and code anything they miss. Unmapped spend never gets a guessed GL account — it waits here."
      />
      <CodingClient
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          priority: r.priority,
          active: r.active,
          match: (r.match ?? {}) as Record<string, string>,
          assign: (r.assign ?? {}) as Record<string, string>,
        }))}
        needsCoding={needsCoding}
        providers={options.providers}
        agents={options.agents}
        glAccounts={active(dims.glAccounts).map((g) => ({
          id: g.id,
          label: `${g.code} · ${g.name}`,
          accountType: g.accountType,
        }))}
        costCenters={active(dims.costCenters).map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
        entities={active(dims.entities).map((e) => ({ id: e.id, label: `${e.code} · ${e.name}` }))}
        projects={active(dims.projects).map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
        productLines={active(dims.productLines).map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
      />
    </div>
  );
}
