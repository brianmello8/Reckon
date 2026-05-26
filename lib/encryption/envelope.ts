import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const kmsClient = new KMSClient({
  region: process.env.AWS_REGION ?? "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const KMS_KEY_ID = process.env.AWS_KMS_KEY_ID!;

export interface EncryptedPayload {
  ciphertext: Buffer;
  encryptedDek: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Encrypts a plaintext secret using KMS envelope encryption.
 *
 * 1. Generates a data encryption key (DEK) via KMS
 * 2. Encrypts the plaintext with AES-256-GCM using the DEK
 * 3. Returns the ciphertext + encrypted DEK (plaintext DEK is zeroed)
 */
export async function encryptSecret(plaintext: string): Promise<EncryptedPayload> {
  // Generate a data key from KMS
  const { Plaintext: plaintextDek, CiphertextBlob: encryptedDek } =
    await kmsClient.send(
      new GenerateDataKeyCommand({
        KeyId: KMS_KEY_ID,
        KeySpec: "AES_256",
      })
    );

  if (!plaintextDek || !encryptedDek) {
    throw new Error("KMS GenerateDataKey returned empty response");
  }

  const dekBuffer = Buffer.from(plaintextDek);
  const iv = randomBytes(12); // 96-bit IV for GCM

  // Encrypt with AES-256-GCM
  const cipher = createCipheriv("aes-256-gcm", dekBuffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Zero the plaintext DEK from memory
  dekBuffer.fill(0);

  return {
    ciphertext: encrypted,
    encryptedDek: Buffer.from(encryptedDek),
    iv,
    authTag,
  };
}

/**
 * Decrypts a secret that was encrypted with encryptSecret.
 *
 * 1. Decrypts the DEK via KMS
 * 2. Decrypts the ciphertext with AES-256-GCM using the DEK
 * 3. Zeros the DEK and returns the plaintext
 */
export async function decryptSecret(payload: EncryptedPayload): Promise<string> {
  // Decrypt the DEK via KMS
  const { Plaintext: plaintextDek } = await kmsClient.send(
    new DecryptCommand({
      CiphertextBlob: payload.encryptedDek,
    })
  );

  if (!plaintextDek) {
    throw new Error("KMS Decrypt returned empty response");
  }

  const dekBuffer = Buffer.from(plaintextDek);

  // Decrypt with AES-256-GCM
  const decipher = createDecipheriv("aes-256-gcm", dekBuffer, payload.iv);
  decipher.setAuthTag(payload.authTag);
  const decrypted = Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]);

  // Zero the plaintext DEK from memory
  dekBuffer.fill(0);

  return decrypted.toString("utf8");
}

/**
 * Returns the last 4 characters of a plaintext key.
 * This is the only part that's safe to log or display.
 */
export function keyFingerprint(plaintext: string): string {
  return plaintext.slice(-4);
}
