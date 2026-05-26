import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHmac, randomBytes } from "crypto";
import { cookies } from "next/headers";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;
const SCOPES = "chat:write,chat:write.public,channels:read,commands";

function signState(orgId: string, nonce: string): string {
  const payload = `${orgId}:${nonce}`;
  const sig = createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}:${sig}`;
}

export async function GET() {
  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId || !clerkOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up our org ID
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.clerkOrgId, clerkOrgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  const nonce = randomBytes(16).toString("hex");
  const state = signState(org.id, nonce);

  // Store state in a cookie for validation on callback
  const cookieStore = await cookies();
  cookieStore.set("slack_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/slack/callback`;
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", SLACK_CLIENT_ID);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
