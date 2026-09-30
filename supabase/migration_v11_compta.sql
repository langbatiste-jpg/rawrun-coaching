-- ══════════════════════════════════════════════════════════════
-- LANG — MIGRATION V11 : comptabilité, stock, inventaire
-- À coller dans Supabase → SQL Editor → Run (après v9 et v10). Rejouable sans danger.
-- ══════════════════════════════════════════════════════════════

-- Codes articles et prix d'achat sur les produits
alter table products add column if not exists sku text;
alter table products add column if not exists cost_cents integer default 0;
create unique index if not exists products_sku_key on products(sku) where sku is not null;

-- Journal : toutes les recettes, dépenses et apports
create table if not exists compta_entries (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  date date not null default current_date,
  kind text not null check (kind in ('recette', 'depense', 'apport', 'retrait')),
  category text not null,
  label text not null,
  amount_cents integer not null,          -- montant TTC payé / encaissé
  vat_cents integer default 0,            -- TVA (0 en franchise de base)
  variable boolean default false,         -- charge variable (compte de résultat différentiel)
  supplier text,                          -- fournisseur ou client
  payment text,                           -- CB, virement, espèces, Stripe…
  order_id uuid references orders(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  qty integer,
  note text
);

-- Dépenses qui reviennent (abonnements…)
create table if not exists compta_recurring (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  label text not null,
  category text not null,
  amount_cents integer not null,
  frequency text not null default 'month' check (frequency in ('month', 'year')),
  start_date date not null,
  end_date date,
  variable boolean default false,
  supplier text,
  active boolean default true
);

-- Mouvements de stock : entrées (achats), sorties (ventes), inventaires, pertes
create table if not exists stock_movements (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  date date not null default current_date,
  product_id uuid references products(id) on delete cascade,
  qty integer not null,                   -- + entrée, − sortie
  type text not null check (type in ('achat', 'vente', 'inventaire', 'perte', 'initial')),
  unit_cost_cents integer default 0,      -- coût unitaire au moment du mouvement
  order_id uuid references orders(id) on delete set null,
  note text
);

-- Réglages compta (taux de cotisations, régime TVA…)
create table if not exists compta_settings (
  id integer primary key default 1 check (id = 1),
  company_name text default 'LANG Coaching',
  siret text,
  vat_regime text default 'franchise',    -- franchise | reel
  urssaf_services_pct numeric default 21.2,
  urssaf_sales_pct numeric default 12.3,
  stripe_pct numeric default 1.5,
  stripe_fixed_cents integer default 25,
  opening_cash_cents integer default 0
);
insert into compta_settings (id) values (1) on conflict do nothing;

-- Accès : coach uniquement
do $$
declare t text; p record;
begin
  foreach t in array array['compta_entries', 'compta_recurring', 'stock_movements', 'compta_settings'] loop
    execute format('alter table %I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', p.policyname, t);
    end loop;
    execute format('create policy "coach_all" on %I for all to authenticated using (is_coach()) with check (is_coach())', t);
  end loop;
end $$;

-- Dépenses déjà engagées pour le site
insert into compta_recurring (label, category, amount_cents, frequency, start_date, supplier)
select 'Abonnement Claude', 'Logiciels & abonnements', 1800, 'month', date '2026-09-01', 'Anthropic'
where not exists (select 1 from compta_recurring where label = 'Abonnement Claude');

insert into compta_entries (date, kind, category, label, amount_cents, supplier, payment, note)
select date '2026-09-29', 'depense', 'Logiciels & abonnements', 'Crédit API IA (plans d''entraînement du site)', 500, 'Anthropic', 'CB', 'Crédit prépayé console.anthropic.com'
where not exists (select 1 from compta_entries where label like 'Crédit API IA%');
