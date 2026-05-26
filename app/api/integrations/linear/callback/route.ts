import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { linearInstallations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { encryptSecret } from "@/lib/encryption/envelope";
import { LinearClient } from "@linear/sdk";

const LINEAR_CLIENT_ID = process.env.LINEAR_OAUTH_CLIENT_ID!;
const LINEAR_CLIENT_SECRET = process.env.LINEAR_OAUTH_CLIENT_SECRET!;
const STATE_SECRET = process.env.SLACK_SIGNING_SECRET!;

function verifyState(state: string): string | null {
  const parts = state.split(":");
  if (parts.length !== 3) return null;
  const [orgId, nonce, sig] = parts;
  const expected = createHmac("sha256", STATE_SECRET)
    .update(`${orgId}:${nonce}`)
    .digest("hex");
  if (sig !== expected) return null;
  return orgId;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/integrations?error=missing_params", req.url)
    );
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("linear_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/integrations?error=invalid_state", req.url)
    );
  }

  const orgId = verifyState(state);
  if (!orgId) {
    return NextResponse.redirect(
      new URL("/integrations?error=invalid_state", req.url)
    );
  }

  cookieStore.delete("linear_oauth_state");

  // Exchange code for token
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/linear/callback`;
  const tokenRes = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: LINEAR_CLIENT_ID,
      client_secret: LINEAR_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return NextResponse.redirect(
      new URL("/integrations?error=token_exchange_failed", req.url)
    );
  }

  const accessToken = tokenData.access_token as string;

  // Get workspace info
  const linearClient = new LinearClient({ accessToken });
  const org = await linearClient.organization;
  const workspaceId = org.id;

  // Encrypt the token
  const encrypted = await encryptSecret(accessToken);

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  await db
    .insert(linearInstallations)
    .values({
      orgId,
      workspaceId,
      encryptedBotToken: encrypted.ciphertext,
      encryptedDek: encrypted.encryptedDek,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      scopes: tokenData.scope?.split(",") ?? ["read", "write"],
      installedByUserId: user?.id ?? null,
    })
    .onConflictDoUpdate({
      target: linearInstallations.orgId,
      set: {
        workspaceId,
        encryptedBotToken: encrypted.ciphertext,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        scopes: tokenData.scope?.split(",") ?? ["read", "write"],
        installedByUserId: user?.id ?? null,
        installedAt: new Date(),
        uninstalledAt: null,
      },
    });

  return NextResponse.redirect(
    new URL("/integrations?success=linear", req.url)
  );
}
