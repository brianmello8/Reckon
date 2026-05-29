"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Users, Search } from "lucide-react";
import { addDeveloper } from "./actions";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/reckon/primitives";

type Developer = {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
  keyCount: number;
  lastActivity: Date | null;
};

export function DevelopersList({ developers }: { developers: Developer[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      try {
        await addDeveloper(formData);
        toast.success("Developer added");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add developer");
      }
    });
  }

  const filtered = developers.filter(
    (d) =>
      d.displayName.toLowerCase().includes(query.toLowerCase()) ||
      d.email.toLowerCase().includes(query.toLowerCase())
  );

  const addButton = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-[13.5px] font-medium text-paper transition-colors hover:opacity-90">
        <Plus className="h-4 w-4" />
        Add developer
      </DialogTrigger>
      <AddDeveloperDialog pending={pending} onSubmit={handleAdd} />
    </Dialog>
  );

  if (developers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-2 bg-paper py-16">
        <Users className="h-10 w-10 text-ink-4" />
        <h3 className="mt-4 text-[14px] font-medium text-ink">No developers yet</h3>
        <p className="mt-1 text-[13px] text-ink-3">
          Add your first developer to start tracking their AI spend.
        </p>
        <div className="mt-4">{addButton}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search developers…"
            className="h-9 w-full rounded-lg border border-line-2 bg-paper pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
          />
        </div>
        {addButton}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-paper shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              {["Developer", "Email", "Provider keys", "Last active"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((dev, i) => (
              <tr
                key={dev.id}
                className="border-b border-line transition-colors last:border-0 hover:bg-bg-2"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/developers/${dev.id}`}
                    className="flex items-center gap-2.5"
                  >
                    <Avatar name={dev.displayName} size={28} hue={(i * 47) % 360} />
                    <span className="text-[13.5px] font-medium text-ink hover:underline">
                      {dev.displayName}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-[13.5px] text-ink-3">{dev.email}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex h-[21px] items-center rounded-full bg-bg-2 px-2.5 text-[11.5px] font-medium text-ink-2">
                    {dev.keyCount} {dev.keyCount === 1 ? "key" : "keys"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13.5px] text-ink-3">
                  {dev.lastActivity
                    ? formatDistanceToNow(dev.lastActivity, { addSuffix: true })
                    : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddDeveloperDialog({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add developer</DialogTitle>
      </DialogHeader>
      <form action={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" name="displayName" required placeholder="Alice Smith" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="alice@company.com" className="mt-1" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-ink text-[13.5px] font-medium text-paper hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add developer"}
        </button>
      </form>
    </DialogContent>
  );
}
