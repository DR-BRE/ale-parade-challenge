# Ale Parade Challenge

Split-the-G tally for the crew. One shared leaderboard; your device is your login.

## Setup

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. In the SQL editor, run the contents of `supabase/schema.sql`.
3. Copy `.env.local.example` to `.env.local` and fill in the values from
   Project Settings → API (URL, `anon` key, `service_role` key).
4. `npm install && npm run dev` → http://localhost:3000

## Deploy

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and set the
three environment variables from `.env.local` in the Vercel project settings.

## Design

The UI was designed in Claude Design; the handoff bundle (prototype + chat
transcript) lives in `design/`. Spec and plan live in `docs/superpowers/`.
