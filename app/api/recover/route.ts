import { allow } from "@/lib/server/rateLimit";
import { recoverByCode } from "@/lib/server/store";
import { serializeSessionCookie } from "@/lib/server/session";

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(`recover:${ip}`, 10, 60_000)) {
    return Response.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return Response.json({ error: "Enter your recovery code" }, { status: 400 });

  const result = await recoverByCode(code);
  if (!result) return Response.json({ error: "No account found for that code." }, { status: 404 });

  return Response.json(
    { profile: result.profile, secret: result.secret },
    {
      status: 200,
      headers: { "Set-Cookie": serializeSessionCookie({ profileId: result.profile.id, secret: result.secret }) },
    }
  );
}
