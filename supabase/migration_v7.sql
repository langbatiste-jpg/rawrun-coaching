-- ══════════════════════════════════════════════════════════════
-- RAWRUN COACHING — MIGRATION V7 (sécurité + plans IA)
-- À coller UNE FOIS dans Supabase → SQL Editor → Run.
-- Sans danger pour tes données existantes : rien n'est supprimé.
-- ══════════════════════════════════════════════════════════════

-- 0. TON EMAIL COACH ───────────────────────────────────────────
-- ⚠️ Mets ici l'email avec lequel tu vas te connecter en coach
-- (le même que celui du compte créé dans Authentication → Users).
create table if not exists coaches (email text primary key);
insert into coaches (email) values ('langbat57@gmail.com') on conflict do nothing;

create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coaches where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- 1. TABLES QUI N'EXISTAIENT QUE DANS TA BASE (sécurité : on les crée si absentes)
create table if not exists athlete_accounts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  athlete_id uuid references athletes(id) on delete cascade,
  email text unique,
  password_hash text,
  coach_id text,
  strava_connected boolean default false
);
create table if not exists race_goals (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  athlete_id uuid references athletes(id) on delete cascade,
  name text not null, date date not null, location text, distance text,
  goal_type text default 'primary', target_time text, coach_notes text
);
create table if not exists strava_tokens (
  athlete_id uuid primary key references athletes(id) on delete cascade,
  strava_athlete_id bigint, access_token text, refresh_token text, expires_at bigint
);
create table if not exists strava_activities (
  id uuid default gen_random_uuid() primary key,
  athlete_id uuid references athletes(id) on delete cascade,
  strava_id bigint unique, name text, distance numeric, moving_time integer,
  average_speed numeric, average_heartrate numeric, max_heartrate numeric,
  start_date timestamptz, raw jsonb
);
alter table athletes add column if not exists records jsonb default '[]'::jsonb;

-- 2. NOUVEAU : PLANS D'ENTRAÎNEMENT (générés par l'IA ou à la main)
create table if not exists training_plans (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  athlete_id uuid references athletes(id) on delete set null,  -- null = modèle réutilisable
  goal_id uuid references race_goals(id) on delete set null,
  name text not null,
  params jsonb default '{}'::jsonb,   -- objectif, jours dispo, volume…
  outline jsonb default '[]'::jsonb,  -- les phases semaine par semaine
  weeks jsonb default '[]'::jsonb,    -- le détail des séances
  start_week text,                    -- lundi de la 1re semaine (YYYY-MM-DD)
  status text default 'draft'         -- draft | published
);
alter table sessions add column if not exists plan_id uuid references training_plans(id) on delete cascade;

-- 3. RLS : on remplace les accès "tout public" par des règles
do $$
declare t text; p record;
begin
  foreach t in array array['athletes','athlete_accounts','sessions','week_slots','completions','messages',
    'notifications','exercises','strength_sessions','wellness','race_goals','strava_tokens',
    'strava_activities','training_plans','coaches']
  loop
    execute format('alter table %I enable row level security', t);
    -- supprime TOUTES les anciennes règles (y compris celles créées à la main en juin)
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', p.policyname, t);
    end loop;
    -- Le coach connecté a tous les droits partout
    execute format('create policy "coach_all" on %I for all to authenticated using (is_coach()) with check (is_coach())', t);
  end loop;
end $$;

-- Tables que les athlètes LISENT (contenu écrit par le coach)
create policy "anon_read" on sessions          for select to anon using (true);
create policy "anon_read" on strength_sessions for select to anon using (true);
create policy "anon_read" on exercises         for select to anon using (true);
create policy "anon_read" on week_slots        for select to anon using (true);
create policy "anon_read" on race_goals        for select to anon using (true);

-- Tables que les athlètes lisent ET écrivent (retours, chat, forme)
create policy "anon_read"   on completions   for select to anon using (true);
create policy "anon_insert" on completions   for insert to anon with check (true);
create policy "anon_update" on completions   for update to anon using (true) with check (true);
create policy "anon_read"   on messages      for select to anon using (true);
create policy "anon_insert" on messages      for insert to anon with check (from_role = 'athlete');
create policy "anon_insert" on notifications for insert to anon with check (true);
create policy "anon_read"   on wellness      for select to anon using (true);
create policy "anon_insert" on wellness      for insert to anon with check (true);
create policy "anon_update" on wellness      for update to anon using (true) with check (true);
create policy "anon_read"   on strava_activities for select to anon using (true);

-- ⛔ Plus aucun accès public à : athletes, athlete_accounts (mots de passe),
--    strava_tokens, training_plans, coaches. Le serveur (/api) s'en charge.

-- 4. REALTIME (au cas où ce ne serait pas déjà fait)
do $$ begin
  begin alter publication supabase_realtime add table training_plans; exception when others then null; end;
end $$;
