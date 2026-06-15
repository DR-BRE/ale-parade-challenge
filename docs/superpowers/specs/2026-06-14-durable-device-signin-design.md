# Durable Device Sign-In + Recovery Code — Design

**Date:** 2026-06-14
**Status:** Approved

## Problem

Identity lives in exactly one place: `localStorage["aleParade.identity"]` = `{ profileId, secret }` ([lib/identity.ts](../../../lib/identity.ts)). Every API request sends the secret as the `x-profile-*` headers ([lib/useBoard.ts](../../../lib/useBoard.ts)); there is no cookie or server session. The setup screen can only **create** a new profile ([components/SetupScreen.tsx](../../../components/SetupScreen.tsx)) — there is no path to sign back into an existing one. The server stores only a hash of the secret, so once a device loses `localStorage`, the secret is unrecoverable and the user is forced into onboarding, creating a duplicate ("orphan") profile.

iOS clears that `localStorage` on the same device with no app deletion via several mechanisms:

1. **Safari's 7-day cap** — since iOS 13.4, all script-written storage (incl. `localStorage`) is deleted after 7 days without opening the site. The most common cause.
2. **Safari tab vs. home-screen icon are separate storage sandboxes** — sign up in one, open the other → empty → forced re-signup.
3. **Deleting/re-adding the home-screen app** wipes the sandbox.
4. **"Clear History and Website Data"** wipes it.

## Goal

A user signs in once on a device and never has to sign in again — and if storage *is* wiped, they re-attach to their existing profile instead of creating a duplicate. Achieved with two backup layers on top of `localStorage`. The `{ profileId, secret }` identity model is unchanged.

## Layer 1 — Durable server-set cookie (invisible; fixes the 7-day case)

A cookie set by the **server** (HTTP `Set-Cookie`) is exempt from Safari's 7-day script-storage cap and persists to its own expiry. This silently fixes cause #1 with no UX change. It does **not** survive causes #2–#4 (that's Layer 2's job).

- **Cookie:** name `aleParade.session`, value = the identity (`profileId` + `secret`), `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000` (1 year). HttpOnly keeps the secret out of `document.cookie`; the client never reads the cookie directly.
- **Set the cookie** on:
  - `POST /api/profiles` (signup) response.
  - `POST /api/session` — an "adopt/refresh" call the client fires while logged in, so existing users (localStorage but no cookie) and returning users get a fresh 1-year cookie on every visit.
  - `POST /api/recover` response (Layer 2).
- **`GET /api/session`** reads the cookie, validates the secret against `profile_secrets`, and returns `{ profileId, secret }` (or 401 if absent/invalid).

### New client load sequence ([app/page.tsx](../../../app/page.tsx))

The load logic moves into a small testable async function `resolveIdentity()` (e.g. in `lib/identity.ts`) so it can be unit-tested without React:

1. `loadIdentity()` from localStorage:
   - **Present** → use it; fire-and-forget `POST /api/session` to (re)set the cookie and ensure a recovery code exists.
   - **Absent** → `GET /api/session`. If the cookie survived → returns identity → `saveIdentity()` back to localStorage → user is logged in **with no prompt** (this is the primary fix). If it 401s → show setup.

The existing `ready`/`identity` state machine in `page.tsx` is preserved; only the effect body changes to await `resolveIdentity()`.

## Layer 2 — Recovery code (survives app deletion / cleared data / sandbox split)

A human-typable code the user carries, so a total wipe ends in re-attachment rather than a duplicate.

- **Format:** `PINT-XXXXX` where `X` is drawn from an unambiguous alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no `0/O/1/I/L`). 5 chars ≈ 33M combinations.
- **Storage:** new column `recovery_code text unique` on `public.profile_secrets`. Stored in **plaintext** (not hashed) because it must be displayed back to the user in their profile screen at any time. This is acceptable at friends-app scale: it lives in the same secrets table that already has no client RLS policy (invisible to the anon key), and only the service-role server can read it. Generation retries on the unique constraint to avoid collisions.
- **Minted** at signup inside `createProfile`. For existing profiles, minted lazily: `POST /api/session` and `POST /api/recover` call `ensureRecoveryCode(profileId)`, which generates and persists one if missing. A one-time backfill script is unnecessary — codes appear the next time each user opens the app.
- **Re-attach flow:** `SetupScreen` gains a secondary **"I already have an account"** action revealing a code input. Submitting calls **`POST /api/recover`** with `{ code }`; the server looks the code up, returns `{ profile, secret }` and sets the cookie. The client `saveIdentity()` and is now the existing profile — no duplicate.
- **Display:** shown once right after signup, and **permanently in `EditProfileModal`** with a copy button and the line *"Save this — it's how you get back in if you clear your browser or switch devices."*

## API

All new routes live under `app/api/`, using the service-role client and the existing `hashSecret`/`safeEqualHex` helpers ([lib/server/secrets.ts](../../../lib/server/secrets.ts)).

- **`POST /api/profiles`** (modified): after creating the profile + secret + recovery code, returns `{ profile, secret, recoveryCode }` **and** sets the `aleParade.session` cookie.
- **`GET /api/session`**: reads cookie → validates → `{ profileId, secret }` (200) or `{ error }` (401).
- **`POST /api/session`**: body `{ profileId, secret }` (the client's current identity). Validates against `profile_secrets`; on success sets/refreshes the cookie, calls `ensureRecoveryCode`, returns `{ ok: true }`. Invalid → 401.
- **`POST /api/recover`**: body `{ code }`. Normalizes (uppercase, trim). Looks up the profile by `recovery_code`. Found → **rotates the secret** (see Storage layer) and returns `{ profile, secret }` with the new plaintext secret + sets the cookie. Not found → 404 `{ error: "No account found for that code." }`. **Basic rate-limiting** (e.g. in-memory per-IP counter, or accept-and-note at this scale) guards against code guessing.

> Note: recovery returns a freshly rotated `secret` rather than the original (the server only ever stored a hash of the old one). The recovering device adopts the new secret; any old device's stored secret stops working, which is harmless since recovery happens precisely when the original device has lost access.

## Storage layer ([lib/server/store.ts](../../../lib/server/store.ts))

- `createProfile` also inserts `recovery_code` (generated) into `profile_secrets`.
- `getByRecoveryCode(code): { profileId, secret? }` — returns the profile + its secret material for recovery. Because the table stores `secret_hash` (not the plaintext secret), recovery cannot return the *original* secret. **Resolution:** on recovery, **rotate the secret** — generate a new secret, update `secret_hash`, and return the new plaintext. This is simpler and safer than storing the plaintext secret, and the old device's secret simply stops working (acceptable; a wiped device has no secret anyway).
- `ensureRecoveryCode(profileId): string` — returns existing code or generates, persists, and returns a new one.
- `getRecoveryCode(profileId): string | null` — for display via the profile screen (or returned by `POST /api/session`).

## New / changed files

- **`supabase/schema.sql`** — add `recovery_code text unique` to `profile_secrets`; provide an `alter table` migration snippet for the existing deployed DB.
- **`lib/server/recovery.ts`** (new) — `generateRecoveryCode()` (format + unambiguous alphabet).
- **`lib/server/session.ts`** (new) — cookie read/serialize helpers (name, flags, max-age).
- **`lib/server/store.ts`** — `getByRecoveryCode`, `ensureRecoveryCode`, `getRecoveryCode`, secret rotation; `createProfile` writes the code.
- **`lib/identity.ts`** — `resolveIdentity()` load-sequence function; identity type unchanged.
- **`app/api/profiles/route.ts`** — set cookie + return `recoveryCode` from POST.
- **`app/api/session/route.ts`** (new) — GET + POST.
- **`app/api/recover/route.ts`** (new) — POST.
- **`app/page.tsx`** — await `resolveIdentity()` in the load effect.
- **`components/SetupScreen.tsx`** — "I already have an account" → recovery-code input → `POST /api/recover`.
- **`components/EditProfileModal.tsx`** — display the recovery code with copy.
- **`app/globals.css`** — styling for the recovery-code input/link and the code display chip.

## Error handling

- `GET /api/session` with no/invalid cookie → 401; client falls through to the setup screen.
- `POST /api/recover` unknown code → 404 with a friendly message surfaced via the existing `.toast` pattern.
- Cookie or localStorage write failures are non-fatal — the app still works for the session, matching the current `saveIdentity` catch.

## Security notes

- Recovery code grants account takeover if guessed: ~33M space + rate-limiting is adequate for a small friends' app; documented as a known trade-off, not bank-grade.
- Cookie is `HttpOnly; Secure; SameSite=Lax`.
- Recovery rotates the secret, so a leaked old secret is invalidated on re-attach.

## Testing

Mirror the existing `app/api/**/route.test.ts` and `lib/server/secrets.test.ts` patterns (Vitest):

- **`/api/session`** — GET returns identity for a valid cookie, 401 for none/invalid; POST sets the cookie + mints a recovery code for valid creds, 401 for invalid.
- **`/api/recover`** — known code returns profile + (rotated) secret + sets cookie; unknown code → 404; code normalization (case/whitespace).
- **`generateRecoveryCode`** — format, alphabet excludes ambiguous chars, returns distinct values across calls.
- **`resolveIdentity`** — localStorage-present path, cookie-rehydrate path, both-empty path (with `GET /api/session` mocked).
- **`createProfile`** — persists a recovery code; `ensureRecoveryCode` is idempotent.

Per the project memory, verify with `tsc` + `vitest` (no `next build` while `next dev` runs).
