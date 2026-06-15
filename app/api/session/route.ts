import { hashSecret, safeEqualHex } from "@/lib/server/secrets";
import { ensureRecoveryCode, getSecretHash } from "@/lib/server/store";
import { readSessionCookie, serializeSessionCookie } from "@/lib/server/session";

export async function GET(req: Request): Promise<Response> {
  const identity = readSessionCookie(req);
  if (!identity) return Response.json({ error: "No session" }, { status: 401 });
  const storedHash = await getSecretHash(identity.profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(identity.secret))) {
    return Response.json({ error: "No session" }, { status: 401 });
  }
  return Response.json({ profileId: identity.profileId, secret: identity.secret }, { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  let body: { profileId?: unknown; secret?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const profileId = typeof body.profileId === "string" ? body.profileId : null;
  const secret = typeof body.secret === "string" ? body.secret : null;
  if (!profileId || !secret) {
    return Response.json({ error: "Missing credentials" }, { status: 401 });
  }
  const storedHash = await getSecretHash(profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(secret))) {
    return Response.json({ error: "Not your pint" }, { status: 401 });
  }
  const recoveryCode = await ensureRecoveryCode(profileId);
  return Response.json(
    { ok: true, recoveryCode },
    { status: 200, headers: { "Set-Cookie": serializeSessionCookie({ profileId, secret }) } }
  );
}
