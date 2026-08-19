-- Migration for the already-deployed database (run once, in order):
-- delete from public.splits;
-- delete from public.profiles;
-- drop table if exists public.profile_secrets;
-- alter table public.profiles alter column id drop default;
-- alter table public.profiles
--   add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
--
-- Later migration — add the Rate-my-G accuracy scores table (run once):
-- create table public.scores (
--   id uuid primary key default gen_random_uuid(),
--   profile_id uuid not null references public.profiles(id) on delete cascade,
--   score int not null check (score between 0 and 100),
--   created_at timestamptz not null default now()
-- );
-- alter table public.scores enable row level security;
-- create policy "public read scores" on public.scores for select using (true);
-- alter publication supabase_realtime add table public.scores;

-- Ale Parade Challenge schema. Run in the Supabase SQL editor.

-- Identity is Supabase Auth (Google). A profile's id IS the auth user id.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  photo_url text,
  created_at timestamptz not null default now()
);

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null check (delta in (1, -1)),
  created_at timestamptz not null default now()
);

-- Rate-my-G accuracy scores (0..100). One row per judged glass; the board
-- shows each person's running average.
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.splits enable row level security;
alter table public.scores enable row level security;

-- Anyone with the anon key may read the board; writes go through service-role API routes.
create policy "public read profiles" on public.profiles for select using (true);
create policy "public read splits" on public.splits for select using (true);
create policy "public read scores" on public.scores for select using (true);

-- Live updates for the leaderboard.
alter publication supabase_realtime add table public.splits;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.scores;
