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

// Two inserts, no transaction: a failure between them leaves a ghost profile
// (visible, never incrementable). Accepted at friends-app scale; clean up via dashboard.
export async function createProfile(args: {
  name: string;
  photoUrl: string | null;
  secretHash: string;
}): Promise<ProfileRow> {
  const db = serviceClient();
  const { data: profile, error } = await db
    .from("profiles")
    .insert({ name: args.name, photo_url: args.photoUrl })
    .select()
    .single();
  if (error) throw error;
  const { error: secretError } = await db
    .from("profile_secrets")
    .insert({ profile_id: profile.id, secret_hash: args.secretHash });
  if (secretError) throw secretError;
  return profile;
}

export async function updateProfile(args: {
  profileId: string;
  name: string;
  photoUrl: string | null;
}): Promise<ProfileRow> {
  const db = serviceClient();
  const { data, error } = await db
    .from("profiles")
    .update({ name: args.name, photo_url: args.photoUrl })
    .eq("id", args.profileId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSecretHash(profileId: string): Promise<string | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("profile_secrets")
    .select("secret_hash")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.secret_hash ?? null;
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
