-- ══════════════════════════════════════════════════════════════
-- LANG — MIGRATION V10 : commandes automatisées
-- (numéro de commande, code d'accès envoyé au client, bon de livraison)
-- À coller dans Supabase → SQL Editor → Run, APRÈS migration_v9_boutique.sql.
-- Rejouable sans danger.
-- ══════════════════════════════════════════════════════════════

alter table orders add column if not exists order_no text;
alter table orders add column if not exists athlete_id uuid references athletes(id) on delete set null;
alter table orders add column if not exists access_code text;
alter table orders add column if not exists shipped_at timestamptz;
alter table orders add column if not exists tracking text;
create unique index if not exists orders_order_no_key on orders(order_no);

-- Numéro de commande lisible : LANG-2026-0001, LANG-2026-0002…
create sequence if not exists order_no_seq;
create or replace function next_order_no() returns text language sql as $$
  select 'LANG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_no_seq')::text, 4, '0');
$$;
revoke all on function next_order_no() from public, anon, authenticated;

-- Les notifications peuvent concerner une commande (sans athlète)
alter table notifications alter column athlete_id drop not null;
alter table athletes add column if not exists subscription_status text; -- active | canceled
