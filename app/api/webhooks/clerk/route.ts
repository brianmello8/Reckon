import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { organizations, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { WebhookEvent } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  switch (evt.type) {
    case "organization.created": {
      const { id, name, slug } = evt.data;
      await db
        .insert(organizations)
        .values({
          clerkOrgId: id,
          name,
          slug: slug ?? id,
        })
        .onConflictDoNothing();
      break;
    }

    case "organizationMembership.created": {
      const { organization, public_user_data, role } = evt.data;
      const clerkOrgId = organization.id;
      const clerkUserId = public_user_data.user_id;

      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrgId))
        .limit(1);

      if (!org[0]) break;

      const mappedRole = role === "org:admin" ? "admin" : "member";
      // Admins get all surfaces; members default to operations only.
      const surfaces: ("operations" | "workflows" | "finance")[] =
        mappedRole === "admin"
          ? ["operations", "workflows", "finance"]
          : ["operations"];

      await db
        .insert(users)
        .values({
          orgId: org[0].id,
          clerkUserId,
          email: public_user_data.identifier ?? "",
          name:
            [public_user_data.first_name, public_user_data.last_name]
              .filter(Boolean)
              .join(" ") || "Unknown",
          role: mappedRole as "admin" | "member",
          surfaces,
        })
        .onConflictDoNothing();
      break;
    }

    case "organizationMembership.deleted": {
      const { organization, public_user_data } = evt.data;
      const clerkOrgId = organization.id;
      const clerkUserId = public_user_data.user_id;

      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrgId))
        .limit(1);

      if (!org[0]) break;

      // Soft-delete: we remove the user row since they're no longer a member.
      // We don't soft-delete users (no deleted_at column) — we just remove.
      await db
        .delete(users)
        .where(
          and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, org[0].id))
        );
      break;
    }
  }

  return NextResponse.json({ received: true });
}
