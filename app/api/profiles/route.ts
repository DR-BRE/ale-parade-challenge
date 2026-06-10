import { generateSecret, hashSecret } from "@/lib/server/secrets";
import { createProfile } from "@/lib/server/store";

const MAX_PHOTO_CHARS = 100_000; // ~75 KB binary; prototype photos are ~15 KB

export async function POST(req: Request): Promise<Response> {
  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 24) {
    return Response.json(
      { error: "Name must be 1-24 characters" },
      { status: 400 }
    );
  }

  let photo: string | null = null;
  if (typeof body.photo === "string" && body.photo.length > 0) {
    const isSmallJpeg =
      body.photo.startsWith("data:image/jpeg;base64,") &&
      body.photo.length <= MAX_PHOTO_CHARS;
    if (!isSmallJpeg) {
      return Response.json(
        { error: "Photo must be a small JPEG data URL" },
        { status: 400 }
      );
    }
    photo = body.photo;
  }

  const secret = generateSecret();
  const profile = await createProfile({
    name,
    photoUrl: photo,
    secretHash: hashSecret(secret),
  });
  return Response.json({ profile, secret }, { status: 201 });
}
