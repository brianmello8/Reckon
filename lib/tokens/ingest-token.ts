import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db/client";
import { ingestTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Scoped, org-level bearer tokens for programmatic ingest (Phase 12.1, §7).
 * We store only a SHA-256 hash + a short display prefix — never the plaintext
 * (same no-plaintext-secret rule as provider keys). The plaintext is shown to
 * the user exactly once, at creation.
 */

const PREFIX = "rk_ing_";

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Mint a new token. Returns the plaintext (show once) + what to persist. */
export function generateIngestToken(): { plaintext: string; tokenHash: string; tokenPrefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${PREFIX}${secret}`;
  return {
    plaintext,
    tokenHash: hashToken(plaintext),
    tokenPrefix: plaintext.slice(0, PREFIX.length + 4), // e.g. rk_ing_aB3x
  };
}

/** Extract a bearer token from Authorization or x-ingest-token. */
export function readBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-ingest-token");
}

export type IngestAuth = { orgId: string; tokenId: string; scope: string };

/**
 * Validate an incoming token. Looks up by hash (constant work — no plaintext in
 * the DB), checks it's active, bumps last_used_at, returns the org. The app DB
 * role bypasses RLS, so this lookup runs before any org context is set.
 * Returns null on any failure (caller responds 401).
 */
export async function authenticateIngestToken(req: Request): Promise<IngestAuth | null> {
  const plaintext = readBearer(req);
  if (!plaintext) return null;
  const tokenHash = hashToken(plaintext);
  const [row] = await db
    .select({
      id: ingestTokens.id,
      orgId: ingestTokens.orgId,
      status: ingestTokens.status,
      scope: ingestTokens.scope,
    })
    .from(ingestTokens)
    .where(eq(ingestTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.status !== "active") return null;
  await db.update(ingestTokens).set({ lastUsedAt: new Date() }).where(eq(ingestTokens.id, row.id));
  return { orgId: row.orgId, tokenId: row.id, scope: row.scope };
}
