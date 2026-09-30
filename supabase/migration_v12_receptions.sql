-- ══════════════════════════════════════════════════════════════
-- LANG — MIGRATION V12 : commandes fournisseurs et réceptions contrôlées
-- À coller dans Supabase → SQL Editor → Run (après v11). Rejouable sans danger.
-- ══════════════════════════════════════════════════════════════

-- Code-barres fabricant (EAN) en plus du code article interne
alter table products add column if not exists barcode text;
create index if not exists products_barcode_idx on products(barcode);

-- Bons de commande fournisseur
create table if not exists purchase_orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  po_no text,
  supplier text,
  status text not null default 'commande' check (status in ('commande', 'en_reception', 'recu', 'annule')),
  ordered_at date default current_date,
  received_at date,
  invoice_no text,
  invoice_amount_cents integer,     -- montant TTC de la facture fournisseur
  shipping_cents integer default 0, -- frais de port facturés
  note text
);

create table if not exists purchase_order_lines (
  id uuid default gen_random_uuid() primary key,
  po_id uuid references purchase_orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  qty_ordered integer not null default 0,
  qty_received integer not null default 0,
  unit_cost_cents integer not null default 0,
  note text
);

-- Numéro lisible : BC-2026-001
create sequence if not exists po_no_seq;
create or replace function next_po_no() returns text language sql as $$
  select 'BC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('po_no_seq')::text, 3, '0');
$$;
grant execute on function next_po_no() to authenticated;

alter table stock_movements add column if not exists po_id uuid references purchase_orders(id) on delete set null;
alter table compta_entries add column if not exists po_id uuid references purchase_orders(id) on delete set null;

do $$
declare t text; p record;
begin
  foreach t in array array['purchase_orders', 'purchase_order_lines'] loop
    execute format('alter table %I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on %I', p.policyname, t);
    end loop;
    execute format('create policy "coach_all" on %I for all to authenticated using (is_coach()) with check (is_coach())', t);
  end loop;
end $$;
