"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateOrgSettings } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

export function SettingsForm({
  orgName,
  digestTimeLocal,
  digestTimezone,
  isAdmin,
}: {
  orgName: string;
  digestTimeLocal: string;
  digestTimezone: string;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateOrgSettings(formData);
        toast.success("Settings saved");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save settings"
        );
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Organization name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={orgName}
              disabled={!isAdmin}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily digest schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="digestTimeLocal">Send time</Label>
            <Input
              id="digestTimeLocal"
              name="digestTimeLocal"
              type="time"
              defaultValue={digestTimeLocal}
              disabled={!isAdmin}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="digestTimezone">Timezone</Label>
            <select
              id="digestTimezone"
              name="digestTimezone"
              defaultValue={digestTimezone}
              disabled={!isAdmin}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      )}
    </form>
  );
}
