-- Enable UUID
create extension if not exists "uuid-ossp";

-- Profiles (auto-created on signup)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  created_at timestamptz default now()
);

-- Sessions
create table sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  audio_url text,
  duration_seconds integer,
  recap text,
  status text default 'idle', -- idle | recording | processing | done
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Stamps (marked during recording)
create table stamps (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references sessions(id) on delete cascade not null,
  timestamp_seconds float not null,
  note text,
  created_at timestamptz default now()
);

-- Clips (AI-detected after recording)
create table clips (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references sessions(id) on delete cascade not null,
  type text, -- hook | bars | beat | melody | convo | idea | vocal
  start_time_seconds float,
  end_time_seconds float,
  transcript text,
  ai_label text,
  user_label text,
  created_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table stamps enable row level security;
alter table clips enable row level security;

-- Profile policies
create policy "own profile" on profiles for all using (auth.uid() = id);

-- Session policies
create policy "own sessions" on sessions for all using (auth.uid() = user_id);

-- Stamp policies
create policy "own stamps" on stamps for all using (
  session_id in (select id from sessions where user_id = auth.uid())
);

-- Clip policies
create policy "own clips" on clips for all using (
  session_id in (select id from sessions where user_id = auth.uid())
);

-- Storage bucket for audio
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

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
