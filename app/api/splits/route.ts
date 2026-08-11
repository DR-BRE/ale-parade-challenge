import { getAuthedUser } from "@/lib/server/auth";
import { getCount, insertSplit } from "@/lib/server/store";

export async function POST(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const profileId = user.id;

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

  // Check-then-act: two concurrent -1s can drive the sum to -1. Accepted —
  // owner-only, cosmetic (UI floors at 0), self-healing on the next +1.
  if (delta === -1) {
    const count = await getCount(profileId);
    if (count <= 0) {
      return Response.json({ error: "Nothing to take back" }, { status: 409 });
    }
  }

  const split = await insertSplit(profileId, delta);
  return Response.json({ split }, { status: 201 });
}
