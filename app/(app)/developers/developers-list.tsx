"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Users } from "lucide-react";
import { addDeveloper } from "./actions";
import { formatDistanceToNow } from "date-fns";

type Developer = {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
  keyCount: number;
  lastActivity: Date | null;
};

export function DevelopersList({
  developers,
}: {
  developers: Developer[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      try {
        await addDeveloper(formData);
        toast.success("Developer added");
        setOpen(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to add developer"
        );
      }
    });
  }

  if (developers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <Users className="h-10 w-10 text-zinc-400" />
        <h3 className="mt-4 text-sm font-medium text-zinc-900">
          No developers yet
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          Add your first developer to start tracking their AI spend.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className="mt-4">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add developer
            </Button>
          </DialogTrigger>
          <AddDeveloperDialog pending={pending} onSubmit={handleAdd} />
        </Dialog>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add developer
            </Button>
          </DialogTrigger>
          <AddDeveloperDialog pending={pending} onSubmit={handleAdd} />
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Provider keys</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {developers.map((dev) => (
              <TableRow key={dev.id}>
                <TableCell>
                  <Link
                    href={`/developers/${dev.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {dev.displayName}
                  </Link>
                </TableCell>
                <TableCell className="text-zinc-600">{dev.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{dev.keyCount} keys</Badge>
                </TableCell>
                <TableCell className="text-zinc-600">
                  {dev.lastActivity
                    ? formatDistanceToNow(dev.lastActivity, { addSuffix: true })
                    : "Never"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
          <Input
            id="displayName"
            name="displayName"
            required
            placeholder="Alice Smith"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="alice@company.com"
            className="mt-1"
          />
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Adding..." : "Add developer"}
        </Button>
      </form>
    </DialogContent>
  );
}
