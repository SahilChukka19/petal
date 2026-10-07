-- Run this once in the Supabase SQL editor.

create table if not exists public.daily_updates (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  date date not null,
  what_i_learned text not null default '',
  resources text[] not null default '{}',
  video_url text,
  voice_note_url text,
  created_at timestamptz not null default now(),
  unique (username, date)
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  title text not null,
  url text not null,
  category text,
  emoji text,
  notes text,
  created_at timestamptz not null default now()
);

-- Public bucket for recorded video / voice notes.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- The backend should use the service_role key (bypasses RLS).
-- If you use the anon key instead, uncomment the policies below.
-- alter table public.daily_updates enable row level security;
-- alter table public.resources enable row level security;
-- create policy "anon all" on public.daily_updates for all using (true) with check (true);
-- create policy "anon all" on public.resources for all using (true) with check (true);
-- create policy "anon upload" on storage.objects for insert with check (bucket_id = 'media');

-- ---------------------------------------------------------------------------
-- MIGRATION for tables created from the earlier version of this file
-- (safe to run once; assumes the tables are empty or you backfill `username`).
-- ---------------------------------------------------------------------------
-- alter table public.daily_updates add column if not exists username text;
-- alter table public.daily_updates drop constraint if exists daily_updates_date_key;
-- update public.daily_updates set username = '<your-username>' where username is null;
-- alter table public.daily_updates alter column username set not null;
-- alter table public.daily_updates add constraint daily_updates_username_date_key unique (username, date);
-- alter table public.resources add column if not exists username text;
-- update public.resources set username = '<your-username>' where username is null;
-- alter table public.resources alter column username set not null;
