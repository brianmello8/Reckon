"use client";

import { useTransition, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, GitPullRequest } from "lucide-react";
import {
  disconnectSlack,
  sendTestMessage,
  getSlackChannels,
  setDigestChannel,
} from "./actions";

type SlackInstall = {
  orgId: string;
  workspaceId: string;
  installedAt: Date;
} | null;

export function IntegrationsClient({ slack }: { slack: SlackInstall }) {
  const searchParams = useSearchParams();
  const [disconnectPending, startDisconnect] = useTransition();
  const [testPending, startTest] = useTransition();
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [channelPending, startChannel] = useTransition();

  useEffect(() => {
    if (searchParams.get("success") === "slack") {
      toast.success("Slack connected successfully");
    }
    if (searchParams.get("error")) {
      toast.error(`Slack error: ${searchParams.get("error")}`);
    }
  }, [searchParams]);

  useEffect(() => {
    if (slack) {
      getSlackChannels().then(setChannels).catch(() => {});
    }
  }, [slack]);

  function handleDisconnect() {
    startDisconnect(async () => {
      try {
        await disconnectSlack();
        toast.success("Slack disconnected");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to disconnect");
      }
    });
  }

  function handleTest() {
    startTest(async () => {
      try {
        await sendTestMessage();
        toast.success("Test message sent to your digest channel");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to send test message");
      }
    });
  }

  function handleChannelSelect(channelId: string) {
    startChannel(async () => {
      try {
        await setDigestChannel(channelId);
        toast.success("Digest channel updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update channel");
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Slack */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-zinc-700" />
            <CardTitle>Slack</CardTitle>
          </div>
          {slack ? (
            <Badge>Connected</Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {slack ? (
            <>
              <p className="text-sm text-zinc-600">
                Connected to workspace <span className="font-mono">{slack.workspaceId}</span>
              </p>

              {channels.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700">
                    Digest channel
                  </label>
                  <select
                    onChange={(e) => handleChannelSelect(e.target.value)}
                    disabled={channelPending}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a channel...
                    </option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testPending}
                >
                  {testPending ? "Sending..." : "Send test message"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisconnect}
                  disabled={disconnectPending}
                  className="text-red-600 hover:text-red-700"
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-600">
                Connect Slack to receive daily digests and anomaly alerts.
              </p>
              <a
                href="/api/integrations/slack/install"
                className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Connect Slack
              </a>
            </>
          )}
        </CardContent>
      </Card>

      {/* Linear (placeholder) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <GitPullRequest className="h-5 w-5 text-zinc-700" />
            <CardTitle>Linear</CardTitle>
          </div>
          <Badge variant="secondary">Not connected</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600">
            Connect Linear to auto-create issues for critical anomalies. Coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
