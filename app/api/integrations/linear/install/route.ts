import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHmac, randomBytes } from "crypto";
import { cookies } from "next/headers";

const LINEAR_CLIENT_ID = process.env.LINEAR_OAUTH_CLIENT_ID!;
const STATE_SECRET = process.env.SLACK_SIGNING_SECRET!; // Reuse signing secret for state HMAC

function signState(orgId: string, nonce: string): string {
  const payload = `${orgId}:${nonce}`;
  const sig = createHmac("sha256", STATE_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}:${sig}`;
}

export async function GET() {
  const { userId, orgId: clerkOrgId } = await auth();
  if (!userId || !clerkOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const cookieStore = await cookies();
  cookieStore.set("linear_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/linear/callback`;
  const url = new URL("https://linear.app/oauth/authorize");
  url.searchParams.set("client_id", LINEAR_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read,write,issues:create");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
