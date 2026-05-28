import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.CLERK_SECRET_KEY ?? "fallback-secret"
);

const ISSUER = "reckon";
const EXPIRY = "7d";

interface InvitePayload {
  inviteId: string;
  orgId: string;
  developerId: string;
  email: string;
}

export async function signInviteToken(payload: InvitePayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setExpirationTime(EXPIRY)
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyInviteToken(
  token: string
): Promise<InvitePayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
    return payload as unknown as InvitePayload;
  } catch {
    return null;
  }
}
