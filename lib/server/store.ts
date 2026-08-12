import { createClient } from "@supabase/supabase-js";

export type ProfileRow = {
  id: string;
  name: string;
  photo_url: string | null;
  created_at: string;
};

export type SplitRow = {
  id: string;
  profile_id: string;
  delta: number;
  created_at: string;
};

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Create-if-absent by auth user id; never overwrites an edited name/photo.
export async function ensureProfile(args: {
  id: string;
  name: string;
  photoUrl: string | null;
}): Promise<ProfileRow> {
  const db = serviceClient();
  const { data: existing, error: selErr } = await db
    .from("profiles")
    .select("id, name, photo_url, created_at")
    .eq("id", args.id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const { data, error } = await db
    .from("profiles")
    .insert({ id: args.id, name: args.name, photo_url: args.photoUrl })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(args: {
  profileId: string;
  name: string;
  photoUrl: string | null;
}): Promise<ProfileRow | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("profiles")
    .update({ name: args.name, photo_url: args.photoUrl })
    .eq("id", args.profileId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getCount(profileId: string): Promise<number> {
  const db = serviceClient();
  const { data, error } = await db
    .from("splits")
    .select("delta")
    .eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).reduce((n, row) => n + row.delta, 0);
}

export async function insertSplit(
  profileId: string,
  delta: 1 | -1
): Promise<SplitRow> {
  const db = serviceClient();
  const { data, error } = await db
    .from("splits")
    .insert({ profile_id: profileId, delta })
    .select()
    .single();
  if (error) throw error;
  return data;
}
