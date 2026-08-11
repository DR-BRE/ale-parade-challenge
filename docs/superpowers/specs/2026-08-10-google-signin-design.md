# Google Sign-In (Supabase Auth) — Design

**Date:** 2026-08-10
**Status:** Approved

## Problem

Identity today is a device-bound secret: on first use the server mints a random
`secret`, and `{ profileId, secret }` is stored in `localStorage`
([lib/identity.ts](../../../lib/identity.ts)) plus a 1-year server cookie
([lib/server/session.ts](../../../lib/server/session.ts)). Every write sends the
secret as `x-profile-*` headers. iOS Safari evicts script-written storage after
~7 idle days, so users get logged out; the PINT recovery-code system
([lib/server/recovery.ts](../../../lib/server/recovery.ts),
[app/api/recover/route.ts](../../../app/api/recover/route.ts),
[components/RelinkModal.tsx](../../../components/RelinkModal.tsx)) exists purely
to paper over that. Needing a recovery code is the friction the owner wants gone.

The device-secret model (built in the [2026-06-14 durable-device-signin
spec](2026-06-14-durable-device-signin-design.md)) is being **replaced**, not
extended.

## Goal

A real account, not a device credential. ~4-5 iPhone users tap **Continue with
Google** once and are on the board. If Safari later evicts storage, re-entry is a
single silent tap (they're already logged into Google on the phone) instead of a
recovery code. Supabase Auth — already part of the stack — owns the session,
token refresh, and persistence.

**Honest scope of the win:** Google does not stop Safari's 7-day localStorage
eviction. It converts "locked out, find a recovery code" into "tap one button."
The PWA add-on (below) is what actually makes eviction rare.

## Decisions (from brainstorming)

- **Provider:** Google, via Supabase Auth. (Not Apple — needs a $99/yr developer
  account. Not passkeys/magic-link — more work or more friction.)
- **Existing data:** fresh start. Wipe current `profiles`/`splits`; everyone
  re-signs in with Google. No migration/claim flow.
- **Profile name + photo:** auto-populated from the Google account on first
  sign-in, still editable later via the existing edit screen.
- **PWA:** include a web manifest so Add-to-Home-Screen gives durable storage.

## Architecture

### Identity model
A `profiles` row's primary key becomes the Supabase Auth user id (`auth.users.id`,
Google-backed). The client-side `Identity` type shrinks to `{ profileId: string }`
(the uid) — **no secret**. Writes authenticate with the Supabase access token
(JWT), read fresh from the client at call time so auto-refresh is transparent.

### Client session (replaces `resolveIdentity`)
[lib/supabaseClient.ts](../../../lib/supabaseClient.ts) changes from
`persistSession: false` to `{ persistSession: true, autoRefreshToken: true,
detectSessionInUrl: true }` so the one shared client both reads the public board
and manages the auth session (including catching the OAuth redirect).

Load sequence in [app/page.tsx](../../../app/page.tsx):
1. `supabase.auth.getSession()`. Also subscribe to `onAuthStateChange` to catch
   the post-redirect sign-in.
2. **Session present** → `POST /api/profiles` (ensure-profile, below) → set
   `identity = { profileId: user.id }` → render `Leaderboard`.
3. **No session** → render new `SignInScreen`.

The existing `ready`/`identity` state machine is preserved; only the effect body
and the "no identity" branch (SetupScreen → SignInScreen) change.

### Server JWT verification
New helper `lib/server/auth.ts`:
`getUserIdFromRequest(req): Promise<string | null>` — reads
`Authorization: Bearer <token>`, calls `serviceClient().auth.getUser(token)`,
returns the uid or `null`. Every write route replaces its `x-profile-secret`
hash check with this. (Network call per write; fine at this scale. Local JWT-secret
verification is a possible later optimization, not needed now.)

### Profile creation — `POST /api/profiles` becomes "ensure my profile"
Authenticated, no body. Reads the uid **and** Google metadata
(`user_metadata.full_name`, `user_metadata.avatar_url`) from the verified token,
and upserts a `profiles` row with `id = uid` if absent (name = full_name, else
"Anonymous"; `photo_url` = avatar_url). Returns the profile. Idempotent — safe to
call on every load.

### Writes
- **`PATCH /api/profiles`** (edit name/photo): auth via `getUserIdFromRequest`;
  the uid is the row to update. Body stays `{ name, photo }`.
- **`POST /api/splits`**: auth via `getUserIdFromRequest`; uid = profile_id.
  Logic (delta validation, undo floor) unchanged.
- **`POST /api/rate`** (the AI camera feature): auth swap only; everything else
  (rate limit, image validation, Claude call) unchanged.
- [lib/useBoard.ts](../../../lib/useBoard.ts) `send()` attaches
  `Authorization: Bearer <token>` (from `supabase.auth.getSession()` at call
  time). Board **reads** are public/anon — unchanged. `needsRelink` and the
  RelinkModal path are removed; a 401 (refresh failed) triggers
  `supabase.auth.signOut()` → app falls back to `SignInScreen`.

### New UI
- **`components/SignInScreen.tsx`**: `<Crest />` + one "Continue with Google"
  button → `supabase.auth.signInWithOAuth({ provider: "google", options: {
  redirectTo: window.location.origin } })`. Replaces `SetupScreen` on the
  no-session branch.
- **Sign out**: a button in [components/EditProfileModal.tsx](../../../components/EditProfileModal.tsx)
  calling `supabase.auth.signOut()`. The recovery-code display block there is
  removed.

### Database ([supabase/schema.sql](../../../supabase/schema.sql) + a migration run in the SQL editor)
- Fresh start: `delete from splits; delete from profiles;`
- `drop table profile_secrets;`
- `profiles.id`: drop the `gen_random_uuid()` default; add
  `foreign key (id) references auth.users(id) on delete cascade`. Rows are now
  inserted with an explicit `id = uid`.
- RLS: keep the public-read policies on `profiles`/`splits`. Writes continue
  through service-role API routes (which bypass RLS), so **no new write policies
  are needed**. Remove references to `profile_secrets`.
- Realtime publication for `profiles`/`splits` is unchanged.

### PWA manifest
- `app/manifest.ts` (Next 15 `MetadataRoute.Manifest`): `name`, `short_name`,
  `start_url: "/"`, `display: "standalone"`, theme/background colors from the
  stout palette, icons referencing the existing [app/icon.png](../../../app/icon.png)
  / [app/apple-icon.png](../../../app/apple-icon.png).
- Add `appleWebApp` metadata in [app/layout.tsx](../../../app/layout.tsx) so
  standalone mode + status-bar styling work.
- Known caveat (documented, not blocking): OAuth redirect from an *installed*
  PWA can bounce through Safari and return; acceptable for this crew.

## Cleanup (deleted)
`lib/server/recovery.ts` (+ test), `lib/server/session.ts` (+ test),
`lib/server/secrets.ts` (+ test — no longer any secret to hash),
`app/api/recover/` (+ test), `app/api/session/` (+ test),
`components/RelinkModal.tsx`, `scripts/mint-recovery-code.mjs`, the
`recoverByCode` / `ensureRecoveryCode` / `getSecretHash` helpers and the
secret/recovery logic in `createProfile` in
[lib/server/store.ts](../../../lib/server/store.ts). `lib/identity.ts` shrinks to
just the `Identity = { profileId: string }` type export; all its
localStorage/cookie/`resolveIdentity` logic is deleted (session handling moves to
the Supabase client + `page.tsx`).

## Owner setup (config, ~10 min, one-time, free) — documented in README
1. Google Cloud Console → OAuth 2.0 Client ID (Web); authorized redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: enable, paste Client
   ID/Secret.
3. Supabase → Authentication → URL Configuration: Site URL
   `https://ale-parade-challenge.vercel.app`; add redirect URLs for it and
   `http://localhost:3000`.

No new environment variables (existing `NEXT_PUBLIC_SUPABASE_*` and
`SUPABASE_SERVICE_ROLE_KEY` cover it).

## Testing
- **Route tests** (adapt existing `*.test.ts`): mock `getUserIdFromRequest` →
  return a uid or `null`; assert 401 on `null` and success with a uid, across
  `splits`, `profiles` (POST ensure + PATCH), and `rate`. Update the removed
  routes' tests (delete `session`/`recover` tests).
- **`lib/server/auth.test.ts`**: mock the Supabase `auth.getUser` result;
  verify token parsing and null on missing/invalid.
- **Manual E2E** (after owner setup): on `localhost:3000`, Continue with Google →
  profile auto-created from Google name/photo → pour a split → edit name → sign
  out → sign back in and confirm the *same* profile/score returns. Then deploy
  (`npx vercel --prod`) and repeat on an actual iPhone, including Add to Home
  Screen and confirming it opens standalone.
- `npx vitest run` and `npx tsc --noEmit` green (do **not** `next build` while
  `next dev` is running).
