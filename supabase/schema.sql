-- Ale Parade Challenge schema. Run in the Supabase SQL editor.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  photo_url text,
  created_at timestamptz not null default now()
);

-- Secrets live apart from profiles so public reads can never leak them.
create table public.profile_secrets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  secret_hash text not null
);

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null check (delta in (1, -1)),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profile_secrets enable row level security;
alter table public.splits enable row level security;

-- Anyone with the anon key may read the board; nobody may write.
-- (profile_secrets gets no policy at all: invisible to clients.)
create policy "public read profiles" on public.profiles for select using (true);
create policy "public read splits" on public.splits for select using (true);

-- Live updates for the leaderboard.
alter publication supabase_realtime add table public.splits;
alter publication supabase_realtime add table public.profiles;
