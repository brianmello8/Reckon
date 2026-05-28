import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  const checks: Record<string, { ok: boolean; latency_ms: number; error?: string }> = {};

  // DB check
  const dbStart = performance.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.db = { ok: true, latency_ms: Math.round(performance.now() - dbStart) };
  } catch (error) {
    checks.db = {
      ok: false,
      latency_ms: Math.round(performance.now() - dbStart),
      error: error instanceof Error ? error.message : "Unknown",
    };
  }

  // KMS check (decrypt a canary — only if credentials are configured)
  if (process.env.AWS_KMS_KEY_ID && process.env.AWS_KMS_KEY_ID !== "placeholder") {
    const kmsStart = performance.now();
    try {
      const { encryptSecret, decryptSecret } = await import("@/lib/encryption/envelope");
      const encrypted = await encryptSecret("healthcheck-canary");
      const decrypted = await decryptSecret(encrypted);
      checks.kms = {
        ok: decrypted === "healthcheck-canary",
        latency_ms: Math.round(performance.now() - kmsStart),
      };
    } catch (error) {
      checks.kms = {
        ok: false,
        latency_ms: Math.round(performance.now() - kmsStart),
        error: error instanceof Error ? error.message : "Unknown",
      };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
