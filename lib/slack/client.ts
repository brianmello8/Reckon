import { WebClient } from "@slack/web-api";
import { db } from "@/lib/db/client";
import { slackInstallations } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { decryptSecret } from "@/lib/encryption/envelope";

/**
 * Returns a configured Slack WebClient for the org, or null if not installed.
 */
export async function getSlackClient(
  orgId: string
): Promise<WebClient | null> {
  const [install] = await db
    .select()
    .from(slackInstallations)
    .where(eq(slackInstallations.orgId, orgId))
    .limit(1);

  if (!install || install.uninstalledAt) return null;

  const token = await decryptSecret({
    ciphertext: install.encryptedBotToken,
    encryptedDek: install.encryptedDek,
    iv: install.iv,
    authTag: install.authTag,
  });

  return new WebClient(token);
}

/**
 * Returns the Slack installation metadata (without decrypting the token).
 */
export async function getSlackInstallation(orgId: string) {
  const [install] = await db
    .select({
      orgId: slackInstallations.orgId,
      workspaceId: slackInstallations.workspaceId,
      installedAt: slackInstallations.installedAt,
      uninstalledAt: slackInstallations.uninstalledAt,
    })
    .from(slackInstallations)
    .where(eq(slackInstallations.orgId, orgId))
    .limit(1);

  if (!install || install.uninstalledAt) return null;
  return install;
}
