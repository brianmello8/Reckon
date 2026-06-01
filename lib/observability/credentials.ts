import { encryptSecret, decryptSecret } from "@/lib/encryption/envelope";
import type { ObservabilityCredentials } from "./types";

/**
 * Observability credentials reuse the provider-key KMS envelope (architecture
 * §3b / §-encryption). The credential object is JSON-serialized, then encrypted
 * with AES-256-GCM under a KMS-wrapped data key. Plaintext only ever exists
 * inside the worker at poll time; it is never logged.
 */

export async function encryptCredentials(creds: ObservabilityCredentials) {
  const payload = await encryptSecret(JSON.stringify(creds));
  return {
    encryptedCredentials: payload.ciphertext,
    encryptedDek: payload.encryptedDek,
    iv: payload.iv,
    authTag: payload.authTag,
  };
}

export async function decryptCredentials(row: {
  encryptedCredentials: Buffer;
  encryptedDek: Buffer;
  iv: Buffer;
  authTag: Buffer;
}): Promise<ObservabilityCredentials> {
  const plaintext = await decryptSecret({
    ciphertext: row.encryptedCredentials,
    encryptedDek: row.encryptedDek,
    iv: row.iv,
    authTag: row.authTag,
  });
  return JSON.parse(plaintext) as ObservabilityCredentials;
}
