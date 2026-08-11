import { createClient } from "@supabase/supabase-js";

export type AuthedUser = { id: string; fullName: string | null; avatarUrl: string | null };

// Verify the Supabase access token on the request and return the user, or null.
export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;

  const m = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = (m.full_name ?? m.name ?? null) as string | null;
  const avatarUrl = (m.avatar_url ?? m.picture ?? null) as string | null;
  return { id: data.user.id, fullName, avatarUrl };
}
