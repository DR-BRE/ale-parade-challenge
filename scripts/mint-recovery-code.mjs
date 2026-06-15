// Mint (or fetch) a profile's recovery code so a friend can re-link a device
// whose saved login has drifted out of sync.
//
// Usage (from the project root):
//   node --env-file=.env.local scripts/mint-recovery-code.mjs "Benny"
//
// Prints the existing code if one is already set, otherwise generates and
// stores a new unique one. Hand the code to the friend: they tap +1 in the
// app, the "re-link this device" box appears, they enter the code.
//
// Note: re-linking rotates the profile's secret, so any *other* device that
// was working for that profile will then need to re-link too (same code works).

import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const name = process.argv[2];
if (!name) {
  console.error('Usage: node --env-file=.env.local scripts/mint-recovery-code.mjs "<profile name>"');
  process.exit(1);
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// No 0/O/1/I/L — unambiguous when read off a screen or written down.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generate = () =>
  "PINT-" + Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const { data: profile, error: pErr } = await db
  .from("profiles")
  .select("id, name")
  .eq("name", name)
  .maybeSingle();
if (pErr) throw pErr;
if (!profile) {
  console.error(`No profile named "${name}".`);
  process.exit(1);
}

const { data: existing, error: sErr } = await db
  .from("profile_secrets")
  .select("recovery_code")
  .eq("profile_id", profile.id)
  .maybeSingle();
if (sErr) throw sErr;

if (existing?.recovery_code) {
  console.log(`${profile.name}: ${existing.recovery_code}  (already set)`);
  process.exit(0);
}

for (let attempt = 0; attempt < 5; attempt++) {
  const code = generate();
  const { error } = await db
    .from("profile_secrets")
    .update({ recovery_code: code })
    .eq("profile_id", profile.id);
  if (!error) {
    console.log(`${profile.name}: ${code}`);
    process.exit(0);
  }
  if (error.code !== "23505") throw error; // 23505 = unique violation; retry
}
throw new Error("Could not generate a unique recovery code");
