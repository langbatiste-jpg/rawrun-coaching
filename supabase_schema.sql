-- ══════════════════════════════════════════════
-- RAWRUN COACHING — SUPABASE SQL
-- Colle tout ça dans l'éditeur SQL de Supabase
-- ══════════════════════════════════════════════

-- 1. ATHLÈTES
create table athletes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  code text not null unique,
  goal text,
  perf_5k text,
  perf_10k text,
  notes text
);

-- 2. SÉANCES (bibliothèque)
create table sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  session_type text not null default 'EF',
  description text,
  km numeric,
  notes text,
  blocks jsonb default '[]'::jsonb
);

-- 3. PLANNING HEBDOMADAIRE
create table week_slots (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  athlete_id uuid references athletes(id) on delete cascade,
  week_key text not null,       -- ex: "2026-06-02"
  day_index integer not null,   -- 0=Lun ... 6=Dim
  session_type text,
  session_id uuid references sessions(id) on delete set null,
  km numeric default 0,
  note text,
  unique(athlete_id, week_key, day_index)
);

-- 4. RETOURS DE SÉANCE (completions)
create table completions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  session_key text not null unique,  -- ex: "uuid__2026-06-02__0"
  athlete_id uuid references athletes(id) on delete cascade,
  rpe integer,
  sensations text,
  real_km numeric,
  real_pace text,
  garmin_note text
);

-- 5. MESSAGES CHAT
create table messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  session_key text not null,
  athlete_id uuid references athletes(id) on delete cascade,
  from_role text not null check (from_role in ('coach', 'athlete')),
  text text not null
);

-- 6. NOTIFICATIONS
create table notifications (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  athlete_id uuid references athletes(id) on delete cascade,
  session_key text,
  session_name text,
  type text,       -- 'completion' | 'message'
  title text,
  detail text,
  read boolean default false
);

-- ══════════════════════════════════════════════
-- SÉCURITÉ — accès public (RLS désactivé pour simplifier)
-- En prod tu peux activer RLS plus tard
-- ══════════════════════════════════════════════
alter table athletes enable row level security;
alter table sessions enable row level security;
alter table week_slots enable row level security;
alter table completions enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;

create policy "public_all" on athletes for all using (true) with check (true);
create policy "public_all" on sessions for all using (true) with check (true);
create policy "public_all" on week_slots for all using (true) with check (true);
create policy "public_all" on completions for all using (true) with check (true);
create policy "public_all" on messages for all using (true) with check (true);
create policy "public_all" on notifications for all using (true) with check (true);

-- ══════════════════════════════════════════════
-- REALTIME — activer pour le chat en direct
-- ══════════════════════════════════════════════
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table completions;
alter publication supabase_realtime add table week_slots;
