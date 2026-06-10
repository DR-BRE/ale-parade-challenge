import { hashSecret, safeEqualHex } from "@/lib/server/secrets";
import { getCount, getSecretHash, insertSplit } from "@/lib/server/store";

export async function POST(req: Request): Promise<Response> {
  const profileId = req.headers.get("x-profile-id");
  const secret = req.headers.get("x-profile-secret");
  if (!profileId || !secret) {
    return Response.json({ error: "Missing credentials" }, { status: 401 });
  }

  let body: { delta?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const delta = body.delta;
  if (delta !== 1 && delta !== -1) {
    return Response.json({ error: "delta must be 1 or -1" }, { status: 400 });
  }

  const storedHash = await getSecretHash(profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(secret))) {
    return Response.json({ error: "Not your pint" }, { status: 401 });
  }

  if (delta === -1) {
    const count = await getCount(profileId);
    if (count <= 0) {
      return Response.json({ error: "Nothing to take back" }, { status: 409 });
    }
  }

  const split = await insertSplit(profileId, delta);
  return Response.json({ split }, { status: 201 });
}
