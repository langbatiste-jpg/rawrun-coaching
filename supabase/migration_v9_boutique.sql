-- ══════════════════════════════════════════════════════════════
-- LANG — MIGRATION V9 : offres de coaching (abonnements) + boutique
-- À coller dans Supabase → SQL Editor → Run, APRÈS migration_v7.sql.
-- Rejouable sans danger.
-- ══════════════════════════════════════════════════════════════

-- Offres de coaching (abonnements mensuels ou paiement unique)
create table if not exists offers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  description text,
  price_cents integer not null default 0,
  interval text not null default 'month' check (interval in ('month', 'once')),
  features jsonb default '[]'::jsonb,   -- liste de points forts affichés
  calls_per_week integer default 0,     -- temps d'appel inclus (minutes / semaine)
  highlight boolean default false,      -- offre mise en avant
  active boolean default false,         -- visible sur le site
  sort integer default 0
);

-- Options qu'on ajoute à une offre (appel en plus, renfo, plan de course…)
create table if not exists offer_options (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  description text,
  price_cents integer not null default 0,
  interval text not null default 'month' check (interval in ('month', 'once')),
  active boolean default false,
  sort integer default 0
);

-- Produits de la boutique (gels, accessoires…)
create table if not exists products (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  description text,
  category text default 'Accessoires',
  price_cents integer not null default 0,
  image_url text,
  stock integer,                        -- vide = illimité
  active boolean default false,
  sort integer default 0
);

-- Commandes et abonnements (écrits uniquement par le serveur après paiement)
create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  kind text not null,                   -- 'coaching' | 'shop'
  status text default 'paid',           -- paid | active | canceled | shipped
  email text,
  name text,
  phone text,
  items jsonb default '[]'::jsonb,
  amount_cents integer,
  shipping jsonb,
  stripe_session_id text unique,
  stripe_subscription_id text,
  note text
);

-- Accès : le site public voit les offres et produits EN VENTE ; le coach gère tout
do $$
declare t text; p record;
begin
  foreach t in array array['offers', 'offer_options', 'products', 'orders'] loop
    execute format('alter table %I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', p.policyname, t);
    end loop;
    execute format('create policy "coach_all" on %I for all to authenticated using (is_coach()) with check (is_coach())', t);
  end loop;
end $$;
create policy "public_read" on offers        for select to anon, authenticated using (active);
create policy "public_read" on offer_options for select to anon, authenticated using (active);
create policy "public_read" on products      for select to anon, authenticated using (active);

-- Photos des produits (dossier public « boutique » dans Supabase Storage)
insert into storage.buckets (id, name, public) values ('boutique', 'boutique', true) on conflict (id) do nothing;
drop policy if exists "boutique_coach_write" on storage.objects;
create policy "boutique_coach_write" on storage.objects for all to authenticated
  using (bucket_id = 'boutique' and is_coach()) with check (bucket_id = 'boutique' and is_coach());

-- Exemples de départ (NON visibles sur le site tant que tu ne les mets pas « En vente »)
insert into offers (name, description, price_cents, interval, features, calls_per_week, highlight, sort)
select * from (values
  ('Plan sur mesure', 'Un plan complet vers ta course, construit sur tes chronos. Sans suivi.', 4900, 'once', '["Plan jusqu''à ta course","Allures Smart Pace personnalisées","Accès à l''appli"]'::jsonb, 0, false, 1),
  ('Coaching', 'Ton plan ajusté chaque semaine selon tes retours.', 3900, 'month', '["Plan ajusté chaque semaine","Chat avec ton coach","Analyse de tes sorties Strava","Export montre"]'::jsonb, 0, true, 2),
  ('Coaching Premium', 'Le suivi complet, avec un appel chaque semaine.', 7900, 'month', '["Tout le Coaching","Appel de 30 min chaque semaine","Plan de course et nutrition","Réponse prioritaire"]'::jsonb, 30, false, 3)
) v where not exists (select 1 from offers);

insert into offer_options (name, description, price_cents, interval, sort)
select * from (values
  ('Appel en plus', '30 min d''appel supplémentaire chaque semaine', 2000, 'month', 1),
  ('Renforcement', 'Séances de renfo/PPG intégrées au plan', 1000, 'month', 2),
  ('Stratégie de course', 'Plan de course + protocole nutrition pour ton objectif', 2500, 'once', 3)
) v where not exists (select 1 from offer_options);
