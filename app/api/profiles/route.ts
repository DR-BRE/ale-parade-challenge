import { generateSecret, hashSecret, safeEqualHex } from "@/lib/server/secrets";
import { createProfile, getSecretHash, updateProfile } from "@/lib/server/store";

const MAX_PHOTO_CHARS = 100_000; // ~75 KB binary; prototype photos are ~15 KB

function parseName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= 24 ? name : null;
}

function parsePhoto(value: unknown): { ok: true; photo: string | null } | { ok: false } {
  if (typeof value !== "string" || value.length === 0) return { ok: true, photo: null };
  const isSmallJpeg =
    value.startsWith("data:image/jpeg;base64,") && value.length <= MAX_PHOTO_CHARS;
  return isSmallJpeg ? { ok: true, photo: value } : { ok: false };
}

export async function POST(req: Request): Promise<Response> {
  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = parseName(body.name);
  if (!name) {
    return Response.json(
      { error: "Name must be 1-24 characters" },
      { status: 400 }
    );
  }

  const photo = parsePhoto(body.photo);
  if (!photo.ok) {
    return Response.json(
      { error: "Photo must be a small JPEG data URL" },
      { status: 400 }
    );
  }

  const secret = generateSecret();
  const profile = await createProfile({
    name,
    photoUrl: photo.photo,
    secretHash: hashSecret(secret),
  });
  return Response.json({ profile, secret }, { status: 201 });
}

export async function PATCH(req: Request): Promise<Response> {
  const profileId = req.headers.get("x-profile-id");
  const secret = req.headers.get("x-profile-secret");
  if (!profileId || !secret) {
    return Response.json({ error: "Missing credentials" }, { status: 401 });
  }

  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = parseName(body.name);
  if (!name) {
    return Response.json(
      { error: "Name must be 1-24 characters" },
      { status: 400 }
    );
  }

  const photo = parsePhoto(body.photo);
  if (!photo.ok) {
    return Response.json(
      { error: "Photo must be a small JPEG data URL" },
      { status: 400 }
    );
  }

  const storedHash = await getSecretHash(profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(secret))) {
    return Response.json({ error: "Not your pint" }, { status: 401 });
  }

  const profile = await updateProfile({ profileId, name, photoUrl: photo.photo });
  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }
  return Response.json({ profile }, { status: 200 });
}
