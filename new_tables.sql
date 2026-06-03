-- Exercises library
create table if not exists exercises (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  category text default 'PPG',
  description text,
  video_url text,
  sets integer,
  reps integer,
  duration integer,
  notes text
);

-- Strength sessions
create table if not exists strength_sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  description text,
  exercises jsonb default '[]'::jsonb
);

-- Wellness check-ins
create table if not exists wellness (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  athlete_id uuid references athletes(id) on delete cascade,
  date date not null,
  form integer default 5,
  fatigue integer default 5,
  moral integer default 5,
  sleep integer default 5,
  soreness integer default 5,
  notes text,
  unique(athlete_id, date)
);

-- Add strength_session_id to week_slots
alter table week_slots add column if not exists strength_session_id uuid references strength_sessions(id) on delete set null;

-- RLS policies
create policy if not exists "public_all" on exercises for all using (true) with check (true);
create policy if not exists "public_all" on strength_sessions for all using (true) with check (true);
create policy if not exists "public_all" on wellness for all using (true) with check (true);

alter publication supabase_realtime add table wellness;
