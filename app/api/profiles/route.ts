import { getAuthedUser } from "@/lib/server/auth";
import { ensureProfile, updateProfile } from "@/lib/server/store";

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

// First Google sign-in: create the profile from Google's name/avatar. Idempotent.
export async function POST(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const name = (user.fullName?.trim() || "Anonymous").slice(0, 24);
  const profile = await ensureProfile({ id: user.id, name, photoUrl: user.avatarUrl });
  return Response.json({ profile }, { status: 200 });
}

// Full replace: the client sends the complete desired state; an omitted photo clears it.
export async function PATCH(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = parseName(body.name);
  if (!name) {
    return Response.json({ error: "Name must be 1-24 characters" }, { status: 400 });
  }
  const photo = parsePhoto(body.photo);
  if (!photo.ok) {
    return Response.json({ error: "Photo must be a small JPEG data URL" }, { status: 400 });
  }

  const profile = await updateProfile({ profileId: user.id, name, photoUrl: photo.photo });
  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }
  return Response.json({ profile }, { status: 200 });
}
