# Ale Parade Challenge — Design Spec

**Date:** 2026-06-09
**Status:** Approved pending review

## What it is

**Ale Parade Challenge** is a shared webapp for a friend group to tally successful "G splits" on Guinness pints (first sip lands the beer line through the middle of the G on the glass). Replaces a shared iCloud Notes file. One URL, everyone uses it from their phone at the pub.

## Core decisions

- **Track successes only.** One counter per person. No attempts, no success rates.
- **Device-based identity, no login.** First visit shows profile setup (name + profile photo). A device secret is generated and stored in `localStorage`; every later visit goes straight into the app as that person. No PIN, no passwords, no account recovery — a new device means a new profile. Accepted tradeoff for a friends app.
- **You can only change your own score.** Score changes require the device secret, verified server-side. You cannot bump (or sabotage) anyone else's count.
- **UI built in Claude Design first.** This spec feeds a handoff prompt; the returned UI is wired up afterward.

## Stack

- **Frontend:** Next.js (App Router), deployed on Vercel.
- **Backend:** Supabase free tier — Postgres for data, Storage for profile photos, Realtime for live updates.
- **API:** Next.js route handlers. Clients never write to the database directly; routes verify the device secret. Reads (leaderboard, feed) are public.

## Screens

1. **Profile setup** (first visit only): name field, photo upload, one button. Creates the profile, stores the device secret, drops you on the leaderboard.
2. **Leaderboard (home):** everyone ranked by split count — photo, name, big number. Gold treatment for #1. Your own row has a prominent **+1 "Split it!"** button and a small **−1** undo. +1 triggers a brief pint/foam celebration animation.
3. **Activity feed** (below the leaderboard): recent entries like "Brett split the G — 2h ago", including undos. Live-updates via Supabase Realtime.

## Visual direction

Guinness pub theme: stout-dark background (near-black with warm brown), creamy foam off-white for text and surfaces, gold accents (harp / crest energy), classic pub typography. Mobile-first — this gets used standing at a bar.

## Data model

```
profiles
  id          uuid pk
  name        text
  photo_url   text
  secret_hash text        -- hash of the device secret
  created_at  timestamptz

splits
  id          uuid pk
  profile_id  uuid fk -> profiles
  delta       int         -- +1 or -1
  created_at  timestamptz
```

A person's count is the sum of their deltas (floored at 0 in the UI). The `splits` table doubles as the activity feed and makes undo free.

## API routes

- `POST /api/profiles` — create profile (name, photo). Returns profile + device secret.
- `POST /api/splits` — body: `{ delta: 1 | -1 }`, authenticated by device secret header. Inserts a split row for the matching profile. Rejects a −1 that would take the count below 0.
- Leaderboard and feed are read via the Supabase client (public read, RLS denies all client writes).

## Behavior details

- **Optimistic UI:** +1/−1 update the count immediately; on failure, roll back and show a toast.
- **Realtime:** other devices' leaderboard and feed update live when anyone logs a split.
- **Photo uploads** go to Supabase Storage; store the public URL on the profile.

## Testing

- Unit tests on the API routes: secret verification, delta validation, floor-at-zero rule.
- UI verified manually (it originates from Claude Design).

## Out of scope

Attempts/success rates, locations, photos of pints, multiple groups, profile recovery, editing other people's scores, admin tools.
