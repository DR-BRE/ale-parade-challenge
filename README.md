# Ale Parade Challenge

**A shared "Split the G" leaderboard for the crew — with an AI referee that scores your pour from a photo.**

[![CI](https://github.com/DR-BRE/ale-parade-challenge/actions/workflows/ci.yml/badge.svg)](https://github.com/DR-BRE/ale-parade-challenge/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

**Live demo → [ale-parade-challenge.vercel.app](https://ale-parade-challenge.vercel.app)**

---

## What it is

"Split the G" is a pub game: take the first sip of a Guinness and try to land the
beer line exactly through the middle of the **G** in the wordmark on the glass.
Ale Parade Challenge is the group scoreboard for it. Everyone signs in with Google,
taps a button each time they land a split, and the whole crew watches one live
leaderboard update in real time.

The headline feature is **Rate my G**: snap a photo of your glass and an AI referee
(Claude, via vision) judges where the beer line crosses the G, scores the attempt
0–100, and returns a one-line verdict. Each player's running average accuracy shows
on the board.

## Features

- **One shared, live leaderboard** — Supabase Realtime pushes every split and score
  to all connected devices instantly.
- **Rate my G — AI photo scoring** — a Claude vision call grades the pour, guards
  against non-Guinness photos, and is rate-limited server-side because each scan
  costs real money.
- **Google sign-in** via Supabase Auth; a profile row is created idempotently from
  Google metadata on first login.
- **Installable PWA** — a web manifest + Apple web-app metadata make it a
  home-screen app that survives Safari's storage eviction.
- **Custom liquid-glass UI** — a settling-pint background, frosted honours board,
  and champion plaque, designed in Claude Design.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Backend | Next.js Route Handlers (`app/api/*`) |
| Data & auth | Supabase (Postgres, Auth, Realtime, Row-Level Security) |
| AI | Anthropic Claude (vision) via `@anthropic-ai/sdk` |
| Testing | Vitest |
| Hosting | Vercel |
| CI | GitHub Actions (type-check + tests) |

## Architecture

- **Client** (`app/page.tsx`, `components/`) subscribes to the Supabase auth session
  and to Realtime board updates via `lib/useBoard.ts`.
- **API routes** (`app/api/{splits,rate,profiles}`) authenticate every write by
  verifying the Supabase bearer token server-side (`lib/server/auth.ts`) before
  touching the database (`lib/server/store.ts`).
- **Rate my G** (`app/api/rate`) validates and size-caps the image, enforces a
  per-minute rate limit (`lib/server/rateLimit.ts`), then asks Claude for a
  structured judgement (`is_glass`, `score`, `verdict`).
- **Database** (`supabase/schema.sql`) — `profiles`, `splits`, and `scores` tables
  with Row-Level Security; the profile id *is* the auth user id.

Pure logic (score averaging, time formatting, rate limiting, auth) is factored into
small, unit-tested modules under `lib/`.

## Getting started

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. In the SQL editor, run the contents of `supabase/schema.sql`.
3. Copy `.env.local.example` to `.env.local` and fill in the values from
   **Project Settings → API** (URL, `anon` key, `service_role` key), plus your
   `ANTHROPIC_API_KEY` for Rate my G.
4. Install and run:

   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```

### Sign-in setup (Google via Supabase Auth)

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth client ID
   → Web application. Add authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase** → Authentication → Providers → Google → enable and paste the Client
   ID and Client Secret.
3. **Supabase** → Authentication → URL Configuration → set Site URL and add both your
   deployed URL and `http://localhost:3000` to Redirect URLs.

> On iPhone, add the site to the Home Screen (Share → Add to Home Screen) so the
> installed PWA keeps you signed in through Safari's 7-day storage eviction.

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm start       # serve the production build
npm test        # run the Vitest suite
```

## Testing

Unit and route tests run with Vitest and execute in CI on every push and pull
request:

```bash
npm test
```

Covered: token authentication, rate limiting, score averaging, time formatting,
and the `splits` / `rate` / `profiles` API routes.

## Deploy

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and set the
four environment variables from `.env.local.example`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) in the Vercel project settings.

## Project structure

```
app/            App Router pages, layout, PWA manifest, and API routes
components/     UI (Leaderboard, RateMyG, SignInScreen, PintBackground, …)
lib/           Client hooks + unit-tested server logic (auth, store, rate limit)
supabase/      Database schema (tables + Row-Level Security)
docs/          Design specs and implementation plans
design/        Claude Design handoff bundle (prototype + transcript)
```

## Design

The UI was designed in Claude Design; the handoff bundle (prototype + chat
transcript) lives in `design/`. Feature specs and implementation plans live in
`docs/superpowers/`.

## License

[MIT](LICENSE) © Brett Francoeur
