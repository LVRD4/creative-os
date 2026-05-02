-- Run this in the Supabase SQL editor.
-- If you have existing data, the DROP statements below will clear it.
-- Safe for development; back up prod data before running.

create extension if not exists "uuid-ossp";

-- Drop existing tables in dependency order
drop table if exists clips cascade;
drop table if exists stamps cascade;
drop table if exists recordings cascade;
drop table if exists sessions cascade;
drop table if exists profiles cascade;

-- Profiles (auto-created on signup)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  created_at timestamptz default now()
);

-- Sessions — a container for one studio sitting (can have many recordings)
create table sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  recap text,           -- AI summary across all recordings in this session
  status text default 'idle', -- idle | active | done
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Recordings — each time the user presses record inside a session
create table recordings (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references sessions(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  audio_url text,            -- Supabase Storage path: {userId}/{sessionId}/{recordingId}/audio.m4a
  duration_seconds integer default 0,
  transcript text,           -- Whisper full transcript
  status text default 'recording', -- recording | uploading | processing | done | error
  created_at timestamptz default now()
);

-- Stamps — moments the user flags during a recording
create table stamps (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references sessions(id) on delete cascade not null,
  recording_id uuid references recordings(id) on delete cascade not null,
  timestamp_seconds float not null,
  note text,
  created_at timestamptz default now()
);

-- Clips — AI-detected moments within a single recording
create table clips (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references sessions(id) on delete cascade not null,
  recording_id uuid references recordings(id) on delete cascade not null,
  type text,                 -- hook | bars | verse | melody | beat | idea | convo | adlib
  start_time_seconds float,
  end_time_seconds float,
  transcript text,
  ai_label text,
  user_label text,
  quality text,              -- strong | developing | rough
  complete boolean default true,
  created_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table recordings enable row level security;
alter table stamps enable row level security;
alter table clips enable row level security;

create policy "own profile"     on profiles   for all using (auth.uid() = id);
create policy "own sessions"    on sessions   for all using (auth.uid() = user_id);
create policy "own recordings"  on recordings for all using (auth.uid() = user_id);

create policy "own stamps" on stamps for all using (
  session_id in (select id from sessions where user_id = auth.uid())
);
create policy "own clips" on clips for all using (
  session_id in (select id from sessions where user_id = auth.uid())
);

-- Storage bucket
insert into storage.buckets (id, name, public) values ('audio', 'audio', false)
  on conflict do nothing;

create policy "upload own audio" on storage.objects for insert with check (
  bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "read own audio" on storage.objects for select using (
  bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "delete own audio" on storage.objects for delete using (
  bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
