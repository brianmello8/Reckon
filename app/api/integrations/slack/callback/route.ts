import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { organizations, slackInstallations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { encryptSecret } from "@/lib/encryption/envelope";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;

function verifyState(state: string): string | null {
  const parts = state.split(":");
  if (parts.length !== 3) return null;
  const [orgId, nonce, sig] = parts;
  const expected = createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(`${orgId}:${nonce}`)
    .digest("hex");
  if (sig !== expected) return null;
  return orgId;
}

export async function GET(req: NextRequest) {
  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId || !clerkOrgId) {
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

  // Verify state
  const cookieStore = await cookies();
  const storedState = cookieStore.get("slack_oauth_state")?.value;
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

  // Clear the state cookie
  cookieStore.delete("slack_oauth_state");

  // Exchange code for token
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/slack/callback`;
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.ok) {
    return NextResponse.redirect(
      new URL(
        `/integrations?error=${encodeURIComponent(tokenData.error ?? "token_exchange_failed")}`,
        req.url
      )
    );
  }

  const botToken = tokenData.access_token as string;
  const workspaceId = tokenData.team?.id as string;
  const scopes = (tokenData.scope as string).split(",");

  // Encrypt the bot token
  const encrypted = await encryptSecret(botToken);

  // Find the user who installed
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  // Upsert the installation
  await db
    .insert(slackInstallations)
    .values({
      orgId,
      workspaceId,
      encryptedBotToken: encrypted.ciphertext,
      encryptedDek: encrypted.encryptedDek,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      scopes,
      installedByUserId: user?.id ?? null,
    })
    .onConflictDoUpdate({
      target: slackInstallations.orgId,
      set: {
        workspaceId,
        encryptedBotToken: encrypted.ciphertext,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        scopes,
        installedByUserId: user?.id ?? null,
        installedAt: new Date(),
        uninstalledAt: null,
      },
    });

  return NextResponse.redirect(
    new URL("/integrations?success=slack", req.url)
  );
}
