"use server";

import { requireUser, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { slackInstallations, linearInstallations, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSlackClient, getSlackInstallation } from "@/lib/slack/client";
import { getLinearClient, getLinearInstallation } from "@/lib/linear/client";
import { revalidatePath } from "next/cache";
import { withOrgContext } from "@/lib/db/rls";

export async function getIntegrationsData() {
  const user = await requireUser();
  const [slack, linear, orgRow] = await Promise.all([
    getSlackInstallation(user.orgId),
    getLinearInstallation(user.orgId),
    db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1),
  ]);
  const plan = orgRow[0]?.plan ?? "free";
  return { slack, linear, plan };
}

export async function disconnectSlack() {
  const user = await requireAdmin();

  await db
    .update(slackInstallations)
    .set({ uninstalledAt: new Date() })
    .where(eq(slackInstallations.orgId, user.orgId));

  // Clear the digest channel since Slack is disconnected
  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(organizations)
      .set({ digestSlackChannelId: null, updatedAt: new Date() })
      .where(eq(organizations.id, user.orgId));
  });

  revalidatePath("/integrations");
  return { success: true };
}

export async function sendTestMessage() {
  const user = await requireAdmin();

  // Get the org's digest channel
  const [org] = await withOrgContext(user.orgId, async (tx) => {
    return tx
      .select({ digestSlackChannelId: organizations.digestSlackChannelId })
      .from(organizations)
      .where(eq(organizations.id, user.orgId))
      .limit(1);
  });

  if (!org?.digestSlackChannelId) {
    throw new Error("No digest channel configured. Set one in Settings first.");
  }

  const client = await getSlackClient(user.orgId);
  if (!client) {
    throw new Error("Slack is not connected.");
  }

  await client.chat.postMessage({
    channel: org.digestSlackChannelId,
    text: "Reckon is connected and ready to send digests here.",
  });

  return { success: true };
}

export async function getSlackChannels() {
  const user = await requireUser();

  const client = await getSlackClient(user.orgId);
  if (!client) return [];

  const result = await client.conversations.list({
    types: "public_channel",
    exclude_archived: true,
    limit: 200,
  });

  return (result.channels ?? [])
    .filter((c) => c.id && c.name)
    .map((c) => ({ id: c.id!, name: c.name! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setDigestChannel(channelId: string) {
  const user = await requireAdmin();

  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(organizations)
      .set({ digestSlackChannelId: channelId, updatedAt: new Date() })
      .where(eq(organizations.id, user.orgId));
  });

  revalidatePath("/settings");
  revalidatePath("/integrations");
  return { success: true };
}

export async function disconnectLinear() {
  const user = await requireAdmin();

  await db
    .update(linearInstallations)
    .set({ uninstalledAt: new Date() })
    .where(eq(linearInstallations.orgId, user.orgId));

  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(organizations)
      .set({ linearTeamId: null, updatedAt: new Date() })
      .where(eq(organizations.id, user.orgId));
  });

  revalidatePath("/integrations");
  return { success: true };
}

export async function getLinearTeams() {
  const user = await requireUser();

  const client = await getLinearClient(user.orgId);
  if (!client) return [];

  const teams = await client.teams();
  return teams.nodes.map((t) => ({ id: t.id, name: t.name }));
}

/** Human-readable Linear workspace name (we only persist the workspace UUID). */
export async function getLinearWorkspaceName(): Promise<string | null> {
  const user = await requireUser();
  const client = await getLinearClient(user.orgId);
  if (!client) return null;
  try {
    const org = await client.organization;
    return org?.name ?? null;
  } catch {
    return null;
  }
}

export async function setLinearTeam(teamId: string) {
  const user = await requireAdmin();

  await withOrgContext(user.orgId, async (tx) => {
    await tx
      .update(organizations)
      .set({ linearTeamId: teamId, updatedAt: new Date() })
      .where(eq(organizations.id, user.orgId));
  });

  revalidatePath("/settings");
  revalidatePath("/integrations");
  return { success: true };
}
