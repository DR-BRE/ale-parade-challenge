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
- **Backend:** Supabase free tier — Postgres for data, Realtime for live updates. (No Storage: photos are small data URLs, see below.)
- **API:** Next.js route handlers. Clients never write to the database directly; routes verify the device secret. Reads (leaderboard, feed) are public.

## Screens

The UI was designed in Claude Design; the handoff prototype (HTML + JSX) is the visual source of truth. Where this section and the prototype disagree, the prototype wins.

1. **Profile setup** (first visit only): crest lockup, circular photo uploader with dashed gold ring, single name input, one **"Pour me in"** button (disabled until a name is entered). Creates the profile, stores the device secret, drops you on the leaderboard.
2. **Leaderboard (home):** everyone ranked by split count — rank numeral, circular photo, name, big serif number. #1 gets gold double border, gold rank/count, and a tilted gold crown; leader's name renders at 24px, everyone else 22px. No "You" badge — your own row reads as yours by being inverted (stout-dark card, cream text) with a full-width action bar: a small **−1** undo and the prominent **+1 "Split it!"** button. +1 plays a "pour" animation inside the button (stout fills from the bottom, foam band settles with a wobble, gold ring flash) and the count pops.
3. **Per-person pour breakdown:** every row has a chevron to the right of the score. Tapping it expands that person's history inline ("Split the G — 2h ago"; undos as italic "Took one back"). Anyone can view anyone's breakdown; one row open at a time. Empty history shows "No pours yet."
4. **Empty leaderboard state:** "No one's split the G yet. Tragic." with a subline, shown when all counts are zero.

There is no separate activity feed — the per-person breakdowns replaced it during design iteration.

## Visual direction

Guinness pub theme, per the prototype: stout-dark warm background, foam-cream cards with stout text (pub-mirror inversion), gold accents. Playfair Display for headings/numbers, Source Sans 3 for body. Crest lockup: "EST. 1759 / Ale Parade Challenge / Split-the-G Tally" between gold rules with diamond accents; footer note "First sip decides".

**Pint backdrop:** the page background is an animated settling pour — cream foam head across the top with a `feTurbulence`-roughened organic edge that bobs, a tan settle zone collapsing into a near-black stout body with a ruby glow, downward-streaming micro-bubble cascade lanes, and sparse sinking nitro bubbles. All animation honors `prefers-reduced-motion`. Content floats above it; the leaderboard starts below the foam head.

Theme colors are oklch CSS variables. The design-time tweaks (background warmth 60, gold intensity 65) are baked in as the fixed theme; the prototype's Tweaks panel is a design-tool affordance and is **not** part of the product. Mobile-first (max-width 480px column) — this gets used standing at a bar.

## Data model

```
profiles                       -- public read
  id          uuid pk
  name        text
  photo_url   text             -- small JPEG data URL
  created_at  timestamptz

profile_secrets                -- no client access (RLS: no policies)
  profile_id  uuid pk fk -> profiles
  secret_hash text             -- sha256 of the device secret

splits                         -- public read
  id          uuid pk
  profile_id  uuid fk -> profiles
  delta       int              -- +1 or -1
  created_at  timestamptz
```

Secrets live in their own table so the publicly-readable `profiles` rows never carry them.

A person's count is the sum of their deltas (floored at 0 in the UI). The `splits` table doubles as the per-person pour breakdown and makes undo free. Breakdown timestamps render as relative time ("Just now", "4h ago", "2d ago").

## API routes

- `POST /api/profiles` — create profile (name, photo). Returns profile + device secret.
- `POST /api/splits` — body: `{ delta: 1 | -1 }`, authenticated by device secret header. Inserts a split row for the matching profile. Rejects a −1 that would take the count below 0.
- Leaderboard and feed are read via the Supabase client (public read, RLS denies all client writes).

## Behavior details

- **Optimistic UI:** +1/−1 update the count immediately; on failure, roll back and show a toast.
- **Realtime:** other devices' leaderboard and breakdowns update live when anyone logs a split.
- **Photos:** downscaled client-side to a 192px square JPEG data URL (~10–15 KB, as in the prototype) and stored directly in `profiles.photo_url`. No Supabase Storage needed at this scale.

## Testing

- Unit tests on the API routes: secret verification, delta validation, floor-at-zero rule.
- UI verified manually (it originates from Claude Design).

## Design handoff

The Claude Design export lives in the repo under `design/` (README, chat transcript, and the prototype: `Ale Parade Challenge.html`, `ale-app.jsx`, `ale-components.jsx`, `tweaks-panel.jsx`). The prototype is reference material — recreate its visual output in the production stack; don't ship its internals (Babel-in-browser, window globals, localStorage-only state, the Tweaks panel).

## Out of scope

Attempts/success rates, locations, photos of pints, multiple groups, profile recovery, editing other people's scores, admin tools, activity feed (replaced by per-person breakdowns), the design-tool Tweaks panel.
