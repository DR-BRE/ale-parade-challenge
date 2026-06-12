# Edit Profile (Name + Photo) — Design

**Date:** 2026-06-12
**Status:** Approved

## Goal

Let a signed-up user change their profile name and photo from inside the app. Today both are set once in `SetupScreen` and there is no way to change them afterward.

## User experience

- A small round avatar button (~40px) sits fixed in the top-right corner of the leaderboard view. It shows the user's current photo (or the letter fallback) using the existing `Avatar` component, styled with a glass ring to match the liquid-glass tiles. It renders only for authenticated users; `SetupScreen` is unchanged.
- Tapping it opens a centered glass modal card over a dimmed, blurred backdrop. The board stays visible behind it.
- The modal contains, mirroring the setup screen: a tappable avatar that opens the file picker to choose a new photo (processed by the existing `readPhoto` downscaler), a name input pre-filled with the current name (`maxLength` 24), and Save / Cancel buttons.
- Save is disabled while the name is empty/whitespace or a request is in flight.
- Backdrop click and Escape close the modal without saving. Errors surface via the existing `.toast` pattern.
- On success the modal closes. The existing Supabase realtime subscription on the `profiles` table (`lib/useBoard.ts`) refetches, updating the user's row, the corner avatar, and every other connected client. No optimistic update.

## Components

- **`components/ProfileCorner` rendering (inside `Leaderboard.tsx`):** the corner button. Gets the user's current `Member` by looking up `identity.profileId` in `board.members`. May be a small inline element rather than a separate file if it stays trivial.
- **`components/EditProfileModal.tsx` (new):** client component. Props: `member` (current name/photo), `identity`, `onClose`. Owns local state for name, photo, busy, error. Reuses `readPhoto` from `lib/photo.ts` and `Avatar`.

## API

**`PATCH /api/profiles`** added to the existing `app/api/profiles/route.ts`.

- **Auth:** `x-profile-id` + `x-profile-secret` headers, verified against `profile_secrets.secret_hash` with `hashSecret` + `safeEqualHex` — identical to `app/api/splits/route.ts`. Missing credentials → 401; wrong secret → 401.
- **Body:** `{ name, photo }` — the full desired state. Same validation as POST: name trimmed, 1–24 chars; photo either `null` or a `data:image/jpeg;base64,` URL ≤ 100,000 chars. The client sends the existing photo back unchanged when only the name changes.
- **Response:** `{ profile }` with the updated row, 200.

## Storage

**`updateProfile({ profileId, name, photoUrl })` in `lib/server/store.ts`:** single `update` on the `profiles` row via the service-role client, returning the updated row. The service client bypasses RLS (same as today's inserts), so **no schema or RLS policy changes** are needed.

## Styling

New CSS in `app/globals.css` consistent with the existing glass aesthetic:

- `.profile-corner` — fixed top-right round button with glass ring.
- `.modal-backdrop` — fixed full-screen dim + blur layer.
- `.modal-card` — centered glass card; inner controls reuse/extend the existing `.uploader`, `.name-input`, and button styles from the setup form.

## Error handling

- API: 400 invalid JSON / invalid name / invalid photo, 401 missing or bad credentials. Error JSON shape `{ error: string }` matches existing routes.
- Client: failed save shows toast, modal stays open, busy resets. Failed image read shows "Could not read that image" toast (same as setup).

## Testing

Vitest unit tests for the PATCH handler with the store mocked:

- 401 when headers are missing or the secret doesn't match.
- 400 for empty name, name > 24 chars, non-JPEG/oversized photo.
- 200 with updated profile on valid input; verifies `updateProfile` called with trimmed name and validated photo.

## Out of scope (YAGNI)

- Explicit "remove photo" affordance (the API supports `photo: null`, but no UI for it).
- Name uniqueness, profanity filtering, account deletion.
- Photo storage migration off data URLs.
