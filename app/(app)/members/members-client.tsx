"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMemberSurfaces } from "./actions";

type Surface = "operations" | "workflows" | "finance";
const SURFACES: Surface[] = ["operations", "workflows", "finance"];

type Member = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  surfaces: Surface[];
};

export function MembersClient({ members }: { members: Member[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function toggle(m: Member, surface: Surface) {
    const next = m.surfaces.includes(surface)
      ? m.surfaces.filter((s) => s !== surface)
      : [...m.surfaces, surface];
    setPendingId(m.id);
    try {
      await setMemberSurfaces(m.id, next);
      toast.success("Surfaces updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-bg-2 text-left text-[12px] text-ink-3">
          <tr>
            <th className="px-4 py-2 font-medium">Member</th>
            <th className="px-4 py-2 font-medium">Role</th>
            {SURFACES.map((s) => (
              <th key={s} className="px-4 py-2 font-medium capitalize">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isAdmin = m.role === "admin";
            return (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-ink">{m.name}</div>
                  <div className="text-[12px] text-ink-3">{m.email}</div>
                </td>
                <td className="px-4 py-2.5 text-ink-2 capitalize">{m.role}</td>
                {SURFACES.map((s) => (
                  <td key={s} className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={isAdmin || m.surfaces.includes(s)}
                      disabled={isAdmin || pendingId === m.id}
                      onChange={() => toggle(m, s)}
                      title={
                        isAdmin
                          ? "Admins always have all surfaces"
                          : `Toggle ${s} access`
                      }
                      className="h-4 w-4 accent-ink disabled:opacity-50"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
