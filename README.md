# Ale Parade Challenge

Split-the-G tally for the crew. One shared leaderboard; your device is your login.

## Setup

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. In the SQL editor, run the contents of `supabase/schema.sql`.
3. Copy `.env.local.example` to `.env.local` and fill in the values from
   Project Settings → API (URL, `anon` key, `service_role` key).
4. `npm install && npm run dev` → http://localhost:3000

## Sign-in (Google via Supabase Auth)

Sign-in is Google, handled by Supabase Auth. One-time setup:

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth client ID
   → Web application. Add authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase dashboard** → Authentication → Providers → Google → enable and paste
   the Client ID and Client Secret.
3. **Supabase dashboard** → Authentication → URL Configuration → set Site URL to
   `https://ale-parade-challenge.vercel.app` and add both that URL and
   `http://localhost:3000` to Redirect URLs.
4. Run `supabase/schema.sql` (or the migration block at its top for an existing DB).

No app code or environment variables change for this — the existing
`NEXT_PUBLIC_SUPABASE_*` values are all the client needs.

For maximum "stay signed in" on iPhone, add the site to the Home Screen
(Share → Add to Home Screen): an installed PWA keeps its login through Safari's
7-day storage eviction.

## Deploy

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and set the
three environment variables from `.env.local` in the Vercel project settings.

## Design

The UI was designed in Claude Design; the handoff bundle (prototype + chat
transcript) lives in `design/`. Spec and plan live in `docs/superpowers/`.
