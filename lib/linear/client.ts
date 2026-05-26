import { LinearClient } from "@linear/sdk";
import { db } from "@/lib/db/client";
import { linearInstallations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/encryption/envelope";

/**
 * Returns a configured Linear client for the org, or null if not installed.
 */
export async function getLinearClient(
  orgId: string
): Promise<LinearClient | null> {
  const [install] = await db
    .select()
    .from(linearInstallations)
    .where(eq(linearInstallations.orgId, orgId))
    .limit(1);

  if (!install || install.uninstalledAt) return null;

  const token = await decryptSecret({
    ciphertext: install.encryptedBotToken,
    encryptedDek: install.encryptedDek,
    iv: install.iv,
    authTag: install.authTag,
  });

  return new LinearClient({ accessToken: token });
}

/**
 * Returns the Linear installation metadata (without decrypting the token).
 */
export async function getLinearInstallation(orgId: string) {
  const [install] = await db
    .select({
      orgId: linearInstallations.orgId,
      workspaceId: linearInstallations.workspaceId,
      installedAt: linearInstallations.installedAt,
      uninstalledAt: linearInstallations.uninstalledAt,
    })
    .from(linearInstallations)
    .where(eq(linearInstallations.orgId, orgId))
    .limit(1);

  if (!install || install.uninstalledAt) return null;
  return install;
}
