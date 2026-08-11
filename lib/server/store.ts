import { createClient } from "@supabase/supabase-js";
import { generateSecret, hashSecret } from "@/lib/server/secrets";
import { generateRecoveryCode } from "@/lib/server/recovery";

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
}): Promise<{ profile: ProfileRow; recoveryCode: string }> {
  const db = serviceClient();
  const { data: profile, error } = await db
    .from("profiles")
    .insert({ name: args.name, photo_url: args.photoUrl })
    .select()
    .single();
  if (error) throw error;

  // Retry on the unique constraint; collisions are astronomically rare.
  for (let attempt = 0; attempt < 5; attempt++) {
    const recoveryCode = generateRecoveryCode();
    const { error: secretError } = await db
      .from("profile_secrets")
      .insert({ profile_id: profile.id, secret_hash: args.secretHash, recovery_code: recoveryCode });
    if (!secretError) return { profile, recoveryCode };
    if (secretError.code !== "23505") throw secretError;
  }
  throw new Error("Could not generate a unique recovery code");
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

// Redeem a recovery code: rotate the secret so the recovering device gets a
// fresh credential, and return the profile + new plaintext secret.
export async function recoverByCode(
  code: string
): Promise<{ profile: ProfileRow; secret: string } | null> {
  const db = serviceClient();
  const { data: sec, error } = await db
    .from("profile_secrets")
    .select("profile_id")
    .eq("recovery_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!sec) return null;

  const secret = generateSecret();
  const { error: upErr } = await db
    .from("profile_secrets")
    .update({ secret_hash: hashSecret(secret) })
    .eq("profile_id", sec.profile_id);
  if (upErr) throw upErr;

  const { data: profile, error: pErr } = await db
    .from("profiles")
    .select("id, name, photo_url, created_at")
    .eq("id", sec.profile_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) return null;
  return { profile, secret };
}

// Return the profile's recovery code, generating one if it has none (backfill
// for profiles created before this feature existed).
export async function ensureRecoveryCode(profileId: string): Promise<string | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("profile_secrets")
    .select("recovery_code")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.recovery_code) return data.recovery_code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const recoveryCode = generateRecoveryCode();
    const { error: upErr } = await db
      .from("profile_secrets")
      .update({ recovery_code: recoveryCode })
      .eq("profile_id", profileId);
    if (!upErr) return recoveryCode;
    if (upErr.code !== "23505") throw upErr;
  }
  throw new Error("Could not generate a unique recovery code");
}
