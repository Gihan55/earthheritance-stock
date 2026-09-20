-- Phase 4: buyers, export orders, stock reservations, shipments/dispatch, buyer invoices,
-- raw-material supplier bills, and the payment/receipt registers with allocation.
-- Apply once to a project that already has 0001, 0002, and 0003.
-- Every write is a permission-checked, audited, SECURITY DEFINER RPC. Stock is still only ever
-- touched through the append-only ledger: physical stock drops exactly when a shipment dispatches.
-- Financial documents are never silently edited — corrections are recorded reversals.
begin;

create type public.export_order_status as enum
  ('draft', 'confirmed', 'partially_shipped', 'shipped', 'closed', 'cancelled');
create type public.shipment_status as enum
  ('draft', 'ready', 'dispatched', 'delivered', 'cancelled');
create type public.ledger_status as enum ('recorded', 'reversed');

create sequence public.buyer_code_seq;
create sequence public.export_order_code_seq;
create sequence public.shipment_code_seq;
create sequence public.invoice_code_seq;
create sequence public.bill_code_seq;
create sequence public.payment_code_seq;
create sequence public.buyer_receipt_code_seq;

-- ---- Buyers -------------------------------------------------------------------
create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) between 2 and 160),
  contact_person text not null default '' check (length(contact_person) <= 120),
  phone text not null default '' check (length(phone) <= 40),
  email text not null default '' check (email = '' or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  billing_address text not null default '' check (length(billing_address) <= 500),
  shipping_address text not null default '' check (length(shipping_address) <= 500),
  destination_country text not null default '' check (length(destination_country) <= 80),
  tax_id text not null default '' check (length(tax_id) <= 60),
  payment_terms text not null default '' check (length(payment_terms) <= 160),
  preferred_currency text not null default '' check (preferred_currency = '' or preferred_currency ~ '^[A-Z]{3}$'),
  notes text not null default '' check (length(notes) <= 2000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index buyers_name_idx on public.buyers(lower(name));

-- ---- Export orders ------------------------------------------------------------
create table public.export_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  status public.export_order_status not null default 'draft',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  incoterms text not null default '' check (length(incoterms) <= 40),
  destination_country text not null default '' check (length(destination_country) <= 80),
  order_date date not null default current_date,
  requested_ship_date date,
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index export_orders_buyer_idx on public.export_orders(buyer_id);
create index export_orders_status_idx on public.export_orders(status, created_at desc);

create table public.export_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.export_orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  shipped_quantity numeric(14,3) not null default 0 check (shipped_quantity >= 0),
  notes text not null default '' check (length(notes) <= 500),
  check (shipped_quantity <= quantity)
);
create index export_order_lines_order_idx on public.export_order_lines(order_id);

-- Active reservations hold finished stock against a confirmed order. A reservation is
-- reduced and removed as its stock physically dispatches, or released on cancel/close.
create table public.export_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.export_orders(id) on delete cascade,
  order_line_id uuid not null references public.export_order_lines(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  lot_id uuid not null references public.lots(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index export_reservations_lot_idx on public.export_reservations(lot_id);
create index export_reservations_order_idx on public.export_reservations(order_id);

-- ---- Shipments ----------------------------------------------------------------
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id uuid not null references public.export_orders(id) on delete restrict,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  status public.shipment_status not null default 'draft',
  container_number text not null default '' check (length(container_number) <= 60),
  seal_number text not null default '' check (length(seal_number) <= 60),
  port_of_loading text not null default '' check (length(port_of_loading) <= 120),
  port_of_discharge text not null default '' check (length(port_of_discharge) <= 120),
  vessel text not null default '' check (length(vessel) <= 120),
  etd date,
  eta date,
  package_count integer check (package_count is null or package_count >= 0),
  net_weight_kg numeric(14,3) check (net_weight_kg is null or net_weight_kg >= 0),
  gross_weight_kg numeric(14,3) check (gross_weight_kg is null or gross_weight_kg >= 0),
  bl_reference text not null default '' check (length(bl_reference) <= 120),
  dispatched_on date,
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete restrict,
  dispatched_by uuid references public.profiles(id) on delete restrict,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments(order_id);

create table public.shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  order_line_id uuid not null references public.export_order_lines(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  lot_id uuid not null references public.lots(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  movement_id uuid references public.stock_movements(id) on delete set null
);
create index shipment_lines_shipment_idx on public.shipment_lines(shipment_id);

-- ---- Buyer invoices and supplier bills ----------------------------------------
create table public.export_invoices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id uuid not null references public.export_orders(id) on delete restrict,
  shipment_id uuid references public.shipments(id) on delete set null,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(16,6) not null default 1 check (exchange_rate > 0),
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(16,2) not null default 0 check (subtotal >= 0),
  discount numeric(16,2) not null default 0 check (discount >= 0),
  tax numeric(16,2) not null default 0 check (tax >= 0),
  amount numeric(16,2) not null check (amount >= 0),
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index export_invoices_buyer_idx on public.export_invoices(buyer_id);

create table public.export_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.export_invoices(id) on delete cascade,
  item_id uuid references public.items(id) on delete restrict,
  description text not null check (length(trim(description)) between 1 and 200),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  amount numeric(16,2) not null check (amount >= 0)
);
create index export_invoice_lines_invoice_idx on public.export_invoice_lines(invoice_id);

create table public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete set null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(16,6) not null default 1 check (exchange_rate > 0),
  issue_date date not null default current_date,
  due_date date,
  amount numeric(16,2) not null check (amount >= 0),
  description text not null default '' check (length(description) <= 500),
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index supplier_bills_supplier_idx on public.supplier_bills(supplier_id);

-- ---- Payments and receipts, with allocation -----------------------------------
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(16,6) not null default 1 check (exchange_rate > 0),
  payment_date date not null default current_date,
  amount numeric(16,2) not null check (amount > 0),
  method text not null default '' check (length(method) <= 60),
  reference text not null default '' check (length(reference) <= 120),
  notes text not null default '' check (length(notes) <= 2000),
  status public.ledger_status not null default 'recorded',
  reversed_at timestamptz,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index supplier_payments_supplier_idx on public.supplier_payments(supplier_id);

create table public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supplier_payments(id) on delete cascade,
  bill_id uuid not null references public.supplier_bills(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index payment_allocations_payment_idx on public.supplier_payment_allocations(payment_id);
create index payment_allocations_bill_idx on public.supplier_payment_allocations(bill_id);

create table public.buyer_receipts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(16,6) not null default 1 check (exchange_rate > 0),
  receipt_date date not null default current_date,
  amount numeric(16,2) not null check (amount > 0),
  method text not null default '' check (length(method) <= 60),
  reference text not null default '' check (length(reference) <= 120),
  notes text not null default '' check (length(notes) <= 2000),
  status public.ledger_status not null default 'recorded',
  reversed_at timestamptz,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index buyer_receipts_buyer_idx on public.buyer_receipts(buyer_id);

create table public.buyer_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.buyer_receipts(id) on delete cascade,
  invoice_id uuid not null references public.export_invoices(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index receipt_allocations_receipt_idx on public.buyer_receipt_allocations(receipt_id);
create index receipt_allocations_invoice_idx on public.buyer_receipt_allocations(invoice_id);

-- ---- Reservation-aware availability ------------------------------------------
create function public.app_lot_available(p_lot_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select public.app_lot_on_hand(p_lot_id)
    - coalesce((select sum(quantity) from public.export_reservations where lot_id = p_lot_id), 0);
$$;

-- ---- Buyers lifecycle ---------------------------------------------------------
create function public.app_create_buyer(
  p_name text, p_contact_person text, p_phone text, p_email text, p_billing_address text,
  p_shipping_address text, p_destination_country text, p_tax_id text, p_payment_terms text,
  p_preferred_currency text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text;
begin
  if not public.app_has_permission('buyers.manage') then raise exception 'Not authorized'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Buyer name is required'; end if;
  v_code := 'BYR-' || lpad(nextval('public.buyer_code_seq')::text, 4, '0');
  insert into public.buyers(code, name, contact_person, phone, email, billing_address, shipping_address,
    destination_country, tax_id, payment_terms, preferred_currency, notes, created_by)
    values (v_code, trim(p_name), trim(coalesce(p_contact_person, '')), trim(coalesce(p_phone, '')),
      lower(trim(coalesce(p_email, ''))), trim(coalesce(p_billing_address, '')), trim(coalesce(p_shipping_address, '')),
      trim(coalesce(p_destination_country, '')), upper(trim(coalesce(p_tax_id, ''))), trim(coalesce(p_payment_terms, '')),
      upper(trim(coalesce(p_preferred_currency, ''))), trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_id;
  perform public.app_log_audit('buyer.created', v_id::text, jsonb_build_object('code', v_code, 'name', trim(p_name)));
  return v_id;
end;
$$;

create function public.app_update_buyer(
  p_id uuid, p_name text, p_contact_person text, p_phone text, p_email text, p_billing_address text,
  p_shipping_address text, p_destination_country text, p_tax_id text, p_payment_terms text,
  p_preferred_currency text, p_notes text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('buyers.manage') then raise exception 'Not authorized'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Buyer name is required'; end if;
  update public.buyers set name = trim(p_name), contact_person = trim(coalesce(p_contact_person, '')),
    phone = trim(coalesce(p_phone, '')), email = lower(trim(coalesce(p_email, ''))),
    billing_address = trim(coalesce(p_billing_address, '')), shipping_address = trim(coalesce(p_shipping_address, '')),
    destination_country = trim(coalesce(p_destination_country, '')), tax_id = upper(trim(coalesce(p_tax_id, ''))),
    payment_terms = trim(coalesce(p_payment_terms, '')), preferred_currency = upper(trim(coalesce(p_preferred_currency, ''))),
    notes = trim(coalesce(p_notes, '')), updated_at = now()
    where id = p_id;
  if not found then raise exception 'Buyer not found'; end if;
  perform public.app_log_audit('buyer.updated', p_id::text, '{}'::jsonb);
end;
$$;

create function public.app_set_buyer_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('buyers.manage') then raise exception 'Not authorized'; end if;
  update public.buyers set is_active = p_active, updated_at = now() where id = p_id;
  if not found then raise exception 'Buyer not found'; end if;
  -- History is always preserved; buyers are deactivated, never deleted.
  perform public.app_log_audit('buyer.active_updated', p_id::text, jsonb_build_object('active', p_active));
end;
$$;

-- ---- Export orders ------------------------------------------------------------
create function public.app_create_export_order(
  p_buyer_id uuid, p_currency text, p_incoterms text, p_destination_country text,
  p_order_date date, p_requested_ship_date date, p_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_line jsonb; v_item public.items;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.buyers where id = p_buyer_id and is_active)
    then raise exception 'Choose an active buyer'; end if;
  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then raise exception 'A valid currency is required'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one product line'; end if;
  v_code := 'EO-' || lpad(nextval('public.export_order_code_seq')::text, 4, '0');
  insert into public.export_orders(code, buyer_id, currency, incoterms, destination_country,
    order_date, requested_ship_date, notes, status, created_by)
    values (v_code, p_buyer_id, upper(p_currency), trim(coalesce(p_incoterms, '')),
      trim(coalesce(p_destination_country, '')), coalesce(p_order_date, current_date), p_requested_ship_date,
      trim(coalesce(p_notes, '')), 'draft', auth.uid())
    returning id into v_id;
  for v_line in select jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id = (v_line->>'item_id')::uuid;
    if not found then raise exception 'Every line needs a valid product'; end if;
    if v_item.category <> 'finished_product' then raise exception 'Export orders ship finished products'; end if;
    if (v_line->>'quantity')::numeric <= 0 then raise exception 'Line quantity must be greater than zero'; end if;
    insert into public.export_order_lines(order_id, item_id, quantity, unit_price, notes)
      values (v_id, v_item.id, (v_line->>'quantity')::numeric, coalesce((v_line->>'unit_price')::numeric, 0),
        trim(coalesce(v_line->>'notes', '')));
  end loop;
  perform public.app_log_audit('export_order.created', v_id::text, jsonb_build_object('code', v_code));
  return v_id;
end;
$$;

create function public.app_confirm_export_order(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.export_orders; v_line public.export_order_lines; v_lot public.lots;
  v_remaining numeric; v_available numeric; v_reserve numeric;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_order from public.export_orders where id = p_id for update;
  if not found then raise exception 'Export order not found'; end if;
  if v_order.status <> 'draft' then raise exception 'Only a draft order can be confirmed'; end if;
  -- Reserve available finished stock, oldest lot first. Shortfalls are recorded as shortages,
  -- never as reservations that exceed what physically exists.
  for v_line in select * from public.export_order_lines where order_id = p_id order by id loop
    delete from public.export_reservations where order_line_id = v_line.id;
    v_remaining := v_line.quantity;
    for v_lot in select * from public.lots where item_id = v_line.item_id order by created_at loop
      exit when v_remaining <= 0;
      v_available := public.app_lot_available(v_lot.id);
      if v_available <= 0 then continue; end if;
      v_reserve := least(v_available, v_remaining);
      insert into public.export_reservations(order_id, order_line_id, item_id, lot_id, quantity)
        values (p_id, v_line.id, v_line.item_id, v_lot.id, v_reserve);
      v_remaining := v_remaining - v_reserve;
    end loop;
  end loop;
  update public.export_orders set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(),
    updated_at = now() where id = p_id;
  perform public.app_log_audit('export_order.confirmed', p_id::text, jsonb_build_object('code', v_order.code));
end;
$$;

create function public.app_cancel_export_order(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.export_orders;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_order from public.export_orders where id = p_id for update;
  if not found then raise exception 'Export order not found'; end if;
  if exists(select 1 from public.export_order_lines where order_id = p_id and shipped_quantity > 0)
    then raise exception 'An order with shipped stock cannot be cancelled'; end if;
  if v_order.status not in ('draft', 'confirmed') then raise exception 'This order cannot be cancelled'; end if;
  delete from public.export_reservations where order_id = p_id;
  update public.export_orders set status = 'cancelled', updated_at = now() where id = p_id;
  perform public.app_log_audit('export_order.cancelled', p_id::text, jsonb_build_object('code', v_order.code));
end;
$$;

create function public.app_close_export_order(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.export_orders;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_order from public.export_orders where id = p_id for update;
  if not found then raise exception 'Export order not found'; end if;
  if v_order.status not in ('shipped', 'partially_shipped') then raise exception 'Only a shipped order can be closed'; end if;
  delete from public.export_reservations where order_id = p_id;
  update public.export_orders set status = 'closed', updated_at = now() where id = p_id;
  perform public.app_log_audit('export_order.closed', p_id::text, jsonb_build_object('code', v_order.code));
end;
$$;

-- ---- Shipments ----------------------------------------------------------------
create function public.app_create_shipment(
  p_order_id uuid, p_container_number text, p_seal_number text, p_port_of_loading text,
  p_port_of_discharge text, p_vessel text, p_etd date, p_eta date, p_package_count integer,
  p_net_weight_kg numeric, p_gross_weight_kg numeric, p_bl_reference text, p_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order public.export_orders; v_id uuid; v_code text; v_line jsonb; v_oline public.export_order_lines;
  v_lot public.lots; v_qty numeric; v_planned numeric;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_order from public.export_orders where id = p_order_id for update;
  if not found then raise exception 'Export order not found'; end if;
  if v_order.status not in ('confirmed', 'partially_shipped')
    then raise exception 'Confirm the order before adding a shipment'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one shipment line'; end if;
  v_code := 'SHP-' || lpad(nextval('public.shipment_code_seq')::text, 4, '0');
  insert into public.shipments(code, order_id, buyer_id, container_number, seal_number, port_of_loading,
    port_of_discharge, vessel, etd, eta, package_count, net_weight_kg, gross_weight_kg, bl_reference, notes, status, created_by)
    values (v_code, v_order.id, v_order.buyer_id, trim(coalesce(p_container_number, '')), trim(coalesce(p_seal_number, '')),
      trim(coalesce(p_port_of_loading, '')), trim(coalesce(p_port_of_discharge, '')), trim(coalesce(p_vessel, '')),
      p_etd, p_eta, nullif(coalesce(p_package_count, 0), 0), p_net_weight_kg, p_gross_weight_kg,
      trim(coalesce(p_bl_reference, '')), trim(coalesce(p_notes, '')), 'draft', auth.uid())
    returning id into v_id;
  for v_line in select jsonb_array_elements(p_lines) loop
    select * into v_oline from public.export_order_lines where id = (v_line->>'order_line_id')::uuid
      and order_id = v_order.id;
    if not found then raise exception 'Shipment line does not match this order'; end if;
    v_qty := coalesce((v_line->>'quantity')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    select * into v_lot from public.lots where id = (v_line->>'lot_id')::uuid and item_id = v_oline.item_id;
    if not found then raise exception 'Shipment lot does not match the ordered product'; end if;
    -- Draft shipments may not plan more than the order still needs.
    v_planned := v_oline.shipped_quantity + coalesce((
      select sum(sl.quantity) from public.shipment_lines sl join public.shipments s on s.id = sl.shipment_id
      where sl.order_line_id = v_oline.id and s.status in ('draft', 'ready')), 0);
    if v_planned + v_qty > v_oline.quantity then raise exception 'Cannot plan more than the ordered quantity'; end if;
    insert into public.shipment_lines(shipment_id, order_line_id, item_id, lot_id, quantity)
      values (v_id, v_oline.id, v_oline.item_id, v_lot.id, v_qty);
  end loop;
  if not exists(select 1 from public.shipment_lines where shipment_id = v_id)
    then raise exception 'Add at least one shipment line'; end if;
  perform public.app_log_audit('shipment.created', v_id::text, jsonb_build_object('code', v_code, 'order', v_order.code));
  return v_id;
end;
$$;

create function public.app_mark_shipment_ready(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shipment public.shipments;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_shipment from public.shipments where id = p_id for update;
  if not found then raise exception 'Shipment not found'; end if;
  if v_shipment.status <> 'draft' then raise exception 'Only a draft shipment can be marked ready'; end if;
  update public.shipments set status = 'ready', updated_at = now() where id = p_id;
  perform public.app_log_audit('shipment.ready', p_id::text, jsonb_build_object('code', v_shipment.code));
end;
$$;

create function public.app_dispatch_shipment(p_id uuid, p_dispatched_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shipment public.shipments; v_line public.shipment_lines; v_oline public.export_order_lines;
  v_lot public.lots; v_res public.export_reservations; v_to_consume numeric; v_take numeric; v_wh uuid;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_shipment from public.shipments where id = p_id for update;
  if not found then raise exception 'Shipment not found'; end if;
  if v_shipment.status <> 'ready' then raise exception 'Mark the shipment ready before dispatching'; end if;
  v_wh := public.app_default_warehouse();
  for v_line in select * from public.shipment_lines where shipment_id = p_id order by id loop
    select * into v_lot from public.lots where id = v_line.lot_id for update;
    if not found then raise exception 'Shipment lot no longer exists'; end if;
    if public.app_lot_on_hand(v_line.lot_id) < v_line.quantity
      then raise exception 'Insufficient stock: only % available in lot %',
        trim(to_char(public.app_lot_on_hand(v_line.lot_id), '999999990.999')), v_lot.lot_number; end if;
    select * into v_oline from public.export_order_lines where id = v_line.order_line_id for update;
    if v_oline.shipped_quantity + v_line.quantity > v_oline.quantity
      then raise exception 'Cannot dispatch more than the ordered quantity'; end if;
    -- Consume matching reservations (reduce then remove) so availability reflects reality.
    v_to_consume := v_line.quantity;
    for v_res in select * from public.export_reservations
      where order_line_id = v_line.order_line_id and lot_id = v_line.lot_id and quantity > 0 order by id for update loop
      exit when v_to_consume <= 0;
      v_take := least(v_res.quantity, v_to_consume);
      if v_take >= v_res.quantity
        then delete from public.export_reservations where id = v_res.id;
        else update public.export_reservations set quantity = quantity - v_take where id = v_res.id;
      end if;
      v_to_consume := v_to_consume - v_take;
    end loop;
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, reference, source_type, source_id, created_by)
      values (v_line.item_id, v_wh, v_line.lot_id, 'dispatch', -v_line.quantity, v_shipment.code, 'shipment_line', v_line.id, auth.uid())
      returning id into v_line.movement_id;
    update public.shipment_lines set movement_id = v_line.movement_id where id = v_line.id;
    update public.export_order_lines set shipped_quantity = shipped_quantity + v_line.quantity where id = v_oline.id;
  end loop;
  update public.shipments set status = 'dispatched', dispatched_on = coalesce(p_dispatched_on, current_date),
    dispatched_by = auth.uid(), updated_at = now() where id = p_id;
  update public.export_orders set updated_at = now(), status = (case
    when not exists(select 1 from public.export_order_lines where order_id = v_shipment.order_id and shipped_quantity < quantity)
      then 'shipped' else 'partially_shipped' end)::public.export_order_status
    where id = v_shipment.order_id and status in ('confirmed', 'partially_shipped');
  perform public.app_log_audit('shipment.dispatched', p_id::text, jsonb_build_object('code', v_shipment.code));
end;
$$;

create function public.app_mark_shipment_delivered(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shipment public.shipments;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_shipment from public.shipments where id = p_id for update;
  if not found then raise exception 'Shipment not found'; end if;
  if v_shipment.status <> 'dispatched' then raise exception 'Only a dispatched shipment can be marked delivered'; end if;
  update public.shipments set status = 'delivered', delivered_at = now(), updated_at = now() where id = p_id;
  perform public.app_log_audit('shipment.delivered', p_id::text, jsonb_build_object('code', v_shipment.code));
end;
$$;

-- ---- Buyer invoices -----------------------------------------------------------
create function public.app_create_invoice(
  p_shipment_id uuid, p_issue_date date, p_due_date date, p_currency text, p_exchange_rate numeric,
  p_discount numeric, p_tax numeric, p_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shipment public.shipments; v_id uuid; v_code text; v_line jsonb; v_subtotal numeric := 0;
  v_amount numeric; v_line_amount numeric; v_discount numeric;
begin
  if not public.app_has_permission('exports.manage') then raise exception 'Not authorized'; end if;
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then raise exception 'Shipment not found'; end if;
  if v_shipment.status not in ('dispatched', 'delivered') then raise exception 'Invoice a shipment only once it has dispatched'; end if;
  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then raise exception 'A valid currency is required'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one invoice line'; end if;
  for v_line in select jsonb_array_elements(p_lines) loop
    if length(trim(coalesce(v_line->>'description', ''))) < 1 then raise exception 'Every invoice line needs a description'; end if;
    if (v_line->>'quantity')::numeric <= 0 then raise exception 'Invoice line quantity must be greater than zero'; end if;
    v_line_amount := (v_line->>'quantity')::numeric * coalesce((v_line->>'unit_price')::numeric, 0);
    v_subtotal := v_subtotal + round(v_line_amount, 2);
  end loop;
  v_discount := least(coalesce(p_discount, 0), v_subtotal);
  v_amount := v_subtotal - v_discount + coalesce(p_tax, 0);
  v_code := 'INV-' || lpad(nextval('public.invoice_code_seq')::text, 4, '0');
  insert into public.export_invoices(code, order_id, shipment_id, buyer_id, currency, exchange_rate,
    issue_date, due_date, subtotal, discount, tax, amount, notes, created_by)
    values (v_code, v_shipment.order_id, v_shipment.id, v_shipment.buyer_id, upper(p_currency),
      coalesce(nullif(p_exchange_rate, 0), 1), coalesce(p_issue_date, current_date), p_due_date,
      v_subtotal, v_discount, coalesce(p_tax, 0), v_amount, trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_id;
  for v_line in select jsonb_array_elements(p_lines) loop
    v_line_amount := round((v_line->>'quantity')::numeric * coalesce((v_line->>'unit_price')::numeric, 0), 2);
    insert into public.export_invoice_lines(invoice_id, item_id, description, quantity, unit_price, amount)
      values (v_id, nullif(v_line->>'item_id', '')::uuid, trim(v_line->>'description'),
        (v_line->>'quantity')::numeric, coalesce((v_line->>'unit_price')::numeric, 0), v_line_amount);
  end loop;
  perform public.app_log_audit('invoice.created', v_id::text, jsonb_build_object('code', v_code));
  return v_id;
end;
$$;

-- ---- Supplier bills -----------------------------------------------------------
create function public.app_create_bill(
  p_supplier_id uuid, p_purchase_id uuid, p_issue_date date, p_due_date date, p_currency text,
  p_exchange_rate numeric, p_amount numeric, p_description text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text;
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.suppliers where id = p_supplier_id) then raise exception 'Supplier not found'; end if;
  if p_purchase_id is not null and not exists(select 1 from public.purchases where id = p_purchase_id)
    then raise exception 'Purchase order not found'; end if;
  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then raise exception 'A valid currency is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Bill amount must be greater than zero'; end if;
  v_code := 'BILL-' || lpad(nextval('public.bill_code_seq')::text, 4, '0');
  insert into public.supplier_bills(code, supplier_id, purchase_id, currency, exchange_rate, issue_date,
    due_date, amount, description, notes, created_by)
    values (v_code, p_supplier_id, p_purchase_id, upper(p_currency),
      coalesce(nullif(p_exchange_rate, 0), 1), coalesce(p_issue_date, current_date), p_due_date,
      p_amount, trim(coalesce(p_description, '')), trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_id;
  perform public.app_log_audit('bill.created', v_id::text, jsonb_build_object('code', v_code));
  return v_id;
end;
$$;

-- ---- Supplier payments + allocation -------------------------------------------
create function public.app_record_supplier_payment(
  p_supplier_id uuid, p_currency text, p_payment_date date, p_amount numeric, p_exchange_rate numeric,
  p_method text, p_reference text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text;
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.suppliers where id = p_supplier_id) then raise exception 'Supplier not found'; end if;
  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then raise exception 'A valid currency is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  v_code := 'PAY-' || lpad(nextval('public.payment_code_seq')::text, 4, '0');
  insert into public.supplier_payments(code, supplier_id, currency, exchange_rate, payment_date, amount,
    method, reference, notes, created_by)
    values (v_code, p_supplier_id, upper(p_currency), coalesce(nullif(p_exchange_rate, 0), 1),
      coalesce(p_payment_date, current_date), p_amount, trim(coalesce(p_method, '')), trim(coalesce(p_reference, '')),
      trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_id;
  perform public.app_log_audit('payment.recorded', v_id::text, jsonb_build_object('code', v_code));
  return v_id;
end;
$$;

create function public.app_allocate_payment(p_payment_id uuid, p_bill_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_payment public.supplier_payments; v_bill public.supplier_bills;
  v_applied numeric; v_unapplied numeric; v_bill_paid numeric; v_outstanding numeric;
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Allocation amount must be greater than zero'; end if;
  select * into v_payment from public.supplier_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status <> 'recorded' then raise exception 'A reversed payment cannot be allocated'; end if;
  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then raise exception 'Bill not found'; end if;
  if v_bill.supplier_id <> v_payment.supplier_id then raise exception 'Payments can only be allocated to the same supplier'; end if;
  if v_bill.currency <> v_payment.currency then raise exception 'Payments can only be allocated within the same currency'; end if;
  v_applied := coalesce((select sum(amount) from public.supplier_payment_allocations where payment_id = p_payment_id), 0);
  v_unapplied := v_payment.amount - v_applied;
  if p_amount > v_unapplied then raise exception 'Allocation exceeds the unapplied payment balance'; end if;
  v_bill_paid := coalesce((select sum(amount) from public.supplier_payment_allocations where bill_id = p_bill_id), 0);
  v_outstanding := v_bill.amount - v_bill_paid;
  if p_amount > v_outstanding then raise exception 'Allocation exceeds the outstanding bill balance'; end if;
  insert into public.supplier_payment_allocations(payment_id, bill_id, amount) values (p_payment_id, p_bill_id, p_amount);
  perform public.app_log_audit('payment.allocated', p_payment_id::text, jsonb_build_object('bill', v_bill.code, 'amount', p_amount));
end;
$$;

create function public.app_reverse_supplier_payment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_payment public.supplier_payments;
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  select * into v_payment from public.supplier_payments where id = p_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status <> 'recorded' then raise exception 'This payment has already been reversed'; end if;
  delete from public.supplier_payment_allocations where payment_id = p_id;
  update public.supplier_payments set status = 'reversed', reversed_at = now() where id = p_id;
  perform public.app_log_audit('payment.reversed', p_id::text, jsonb_build_object('code', v_payment.code));
end;
$$;

-- ---- Buyer receipts + allocation ----------------------------------------------
create function public.app_record_buyer_receipt(
  p_buyer_id uuid, p_currency text, p_receipt_date date, p_amount numeric, p_exchange_rate numeric,
  p_method text, p_reference text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text;
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.buyers where id = p_buyer_id) then raise exception 'Buyer not found'; end if;
  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then raise exception 'A valid currency is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Receipt amount must be greater than zero'; end if;
  v_code := 'RCP-' || lpad(nextval('public.buyer_receipt_code_seq')::text, 4, '0');
  insert into public.buyer_receipts(code, buyer_id, currency, exchange_rate, receipt_date, amount,
    method, reference, notes, created_by)
    values (v_code, p_buyer_id, upper(p_currency), coalesce(nullif(p_exchange_rate, 0), 1),
      coalesce(p_receipt_date, current_date), p_amount, trim(coalesce(p_method, '')), trim(coalesce(p_reference, '')),
      trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_id;
  perform public.app_log_audit('receipt.recorded', v_id::text, jsonb_build_object('code', v_code));
  return v_id;
end;
$$;

create function public.app_allocate_receipt(p_receipt_id uuid, p_invoice_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_receipt public.buyer_receipts; v_invoice public.export_invoices;
  v_applied numeric; v_unapplied numeric; v_invoice_paid numeric; v_outstanding numeric;
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Allocation amount must be greater than zero'; end if;
  select * into v_receipt from public.buyer_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.status <> 'recorded' then raise exception 'A reversed receipt cannot be allocated'; end if;
  select * into v_invoice from public.export_invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.buyer_id <> v_receipt.buyer_id then raise exception 'Receipts can only be allocated to the same buyer'; end if;
  if v_invoice.currency <> v_receipt.currency then raise exception 'Receipts can only be allocated within the same currency'; end if;
  v_applied := coalesce((select sum(amount) from public.buyer_receipt_allocations where receipt_id = p_receipt_id), 0);
  v_unapplied := v_receipt.amount - v_applied;
  if p_amount > v_unapplied then raise exception 'Allocation exceeds the unapplied receipt balance'; end if;
  v_invoice_paid := coalesce((select sum(amount) from public.buyer_receipt_allocations where invoice_id = p_invoice_id), 0);
  v_outstanding := v_invoice.amount - v_invoice_paid;
  if p_amount > v_outstanding then raise exception 'Allocation exceeds the outstanding invoice balance'; end if;
  insert into public.buyer_receipt_allocations(receipt_id, invoice_id, amount) values (p_receipt_id, p_invoice_id, p_amount);
  perform public.app_log_audit('receipt.allocated', p_receipt_id::text, jsonb_build_object('invoice', v_invoice.code, 'amount', p_amount));
end;
$$;

create function public.app_reverse_buyer_receipt(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_receipt public.buyer_receipts;
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  select * into v_receipt from public.buyer_receipts where id = p_id for update;
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.status <> 'recorded' then raise exception 'This receipt has already been reversed'; end if;
  delete from public.buyer_receipt_allocations where receipt_id = p_id;
  update public.buyer_receipts set status = 'reversed', reversed_at = now() where id = p_id;
  perform public.app_log_audit('receipt.reversed', p_id::text, jsonb_build_object('code', v_receipt.code));
end;
$$;

-- ---- Read models --------------------------------------------------------------
-- security_invoker views apply the querying user's row-level policies on the base
-- tables, so gating the base tables (below) is what restricts what each role can see.
create view public.export_order_progress with (security_invoker = true) as
  select o.id as order_id, o.code, o.buyer_id, b.name as buyer_name, o.status, o.currency,
    o.order_date, o.requested_ship_date,
    coalesce(sum(l.quantity), 0) as ordered_quantity,
    coalesce(sum(l.shipped_quantity), 0) as shipped_quantity,
    coalesce(sum(res.reserved), 0) as reserved_quantity
  from public.export_orders o
  join public.buyers b on b.id = o.buyer_id
  left join public.export_order_lines l on l.order_id = o.id
  left join (select order_line_id, sum(quantity) as reserved from public.export_reservations group by order_line_id) res
    on res.order_line_id = l.id
  group by o.id, b.name;

create view public.export_invoice_balances with (security_invoker = true) as
  select i.id, i.code, i.buyer_id, b.name as buyer_name, i.order_id, i.shipment_id, i.currency,
    i.exchange_rate, i.issue_date, i.due_date, i.amount,
    coalesce(a.allocated, 0) as allocated,
    i.amount - coalesce(a.allocated, 0) as outstanding,
    case
      when i.amount - coalesce(a.allocated, 0) <= 0 then 'paid'
      when coalesce(a.allocated, 0) > 0 then 'partially_paid'
      when i.due_date is not null and i.due_date < current_date then 'overdue'
      else 'unpaid' end as payment_state
  from public.export_invoices i
  join public.buyers b on b.id = i.buyer_id
  left join (select invoice_id, sum(amount) as allocated from public.buyer_receipt_allocations group by invoice_id) a
    on a.invoice_id = i.id;

create view public.supplier_bill_balances with (security_invoker = true) as
  select bl.id, bl.code, bl.supplier_id, s.name as supplier_name, bl.purchase_id, bl.currency,
    bl.exchange_rate, bl.issue_date, bl.due_date, bl.amount,
    coalesce(a.allocated, 0) as allocated,
    bl.amount - coalesce(a.allocated, 0) as outstanding,
    case
      when bl.amount - coalesce(a.allocated, 0) <= 0 then 'paid'
      when coalesce(a.allocated, 0) > 0 then 'partially_paid'
      when bl.due_date is not null and bl.due_date < current_date then 'overdue'
      else 'unpaid' end as payment_state
  from public.supplier_bills bl
  join public.suppliers s on s.id = bl.supplier_id
  left join (select bill_id, sum(amount) as allocated from public.supplier_payment_allocations group by bill_id) a
    on a.bill_id = bl.id;

create view public.supplier_payment_balances with (security_invoker = true) as
  select p.id, p.code, p.supplier_id, s.name as supplier_name, p.currency, p.payment_date,
    p.amount, p.status,
    coalesce(a.allocated, 0) as allocated,
    p.amount - coalesce(a.allocated, 0) as unapplied
  from public.supplier_payments p
  join public.suppliers s on s.id = p.supplier_id
  left join (select payment_id, sum(amount) as allocated from public.supplier_payment_allocations group by payment_id) a
    on a.payment_id = p.id;

create view public.buyer_receipt_balances with (security_invoker = true) as
  select r.id, r.code, r.buyer_id, b.name as buyer_name, r.currency, r.receipt_date,
    r.amount, r.status,
    coalesce(a.allocated, 0) as allocated,
    r.amount - coalesce(a.allocated, 0) as unapplied
  from public.buyer_receipts r
  join public.buyers b on b.id = r.buyer_id
  left join (select receipt_id, sum(amount) as allocated from public.buyer_receipt_allocations group by receipt_id) a
    on a.receipt_id = r.id;

-- ---- Row level security -------------------------------------------------------
alter table public.buyers enable row level security;
alter table public.export_orders enable row level security;
alter table public.export_order_lines enable row level security;
alter table public.export_reservations enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_lines enable row level security;
alter table public.export_invoices enable row level security;
alter table public.export_invoice_lines enable row level security;
alter table public.supplier_bills enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_allocations enable row level security;
alter table public.buyer_receipts enable row level security;
alter table public.buyer_receipt_allocations enable row level security;

revoke all on public.buyers, public.export_orders, public.export_order_lines, public.export_reservations,
  public.shipments, public.shipment_lines, public.export_invoices, public.export_invoice_lines,
  public.supplier_bills, public.supplier_payments, public.supplier_payment_allocations,
  public.buyer_receipts, public.buyer_receipt_allocations from anon, authenticated;
grant select on public.buyers, public.export_orders, public.export_order_lines, public.export_reservations,
  public.shipments, public.shipment_lines, public.export_invoices, public.export_invoice_lines,
  public.supplier_bills, public.supplier_payments, public.supplier_payment_allocations,
  public.buyer_receipts, public.buyer_receipt_allocations to authenticated;
grant select on public.export_order_progress, public.export_invoice_balances, public.supplier_bill_balances,
  public.supplier_payment_balances, public.buyer_receipt_balances to authenticated;

create policy buyers_read on public.buyers for select to authenticated
  using (public.app_has_permission('buyers.view') or public.app_has_permission('buyers.manage'));
create policy export_orders_read on public.export_orders for select to authenticated
  using (public.app_has_permission('exports.view') or public.app_has_permission('exports.manage'));
create policy export_order_lines_read on public.export_order_lines for select to authenticated
  using (public.app_has_permission('exports.view') or public.app_has_permission('exports.manage'));
create policy export_reservations_read on public.export_reservations for select to authenticated
  using (public.app_has_permission('exports.view') or public.app_has_permission('exports.manage'));
create policy shipments_read on public.shipments for select to authenticated
  using (public.app_has_permission('exports.view') or public.app_has_permission('exports.manage'));
create policy shipment_lines_read on public.shipment_lines for select to authenticated
  using (public.app_has_permission('exports.view') or public.app_has_permission('exports.manage'));
create policy invoices_read on public.export_invoices for select to authenticated
  using (public.app_has_permission('exports.view') or public.app_has_permission('finance.view'));
create policy invoice_lines_read on public.export_invoice_lines for select to authenticated
  using (public.app_has_permission('exports.view') or public.app_has_permission('finance.view'));
create policy bills_read on public.supplier_bills for select to authenticated
  using (public.app_has_permission('finance.view'));
create policy payments_read on public.supplier_payments for select to authenticated
  using (public.app_has_permission('finance.view'));
create policy payment_allocations_read on public.supplier_payment_allocations for select to authenticated
  using (public.app_has_permission('finance.view'));
create policy receipts_read on public.buyer_receipts for select to authenticated
  using (public.app_has_permission('finance.view'));
create policy receipt_allocations_read on public.buyer_receipt_allocations for select to authenticated
  using (public.app_has_permission('finance.view'));

-- ---- Grants -------------------------------------------------------------------
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'app_lot_available', 'app_create_buyer', 'app_update_buyer', 'app_set_buyer_active',
      'app_create_export_order', 'app_confirm_export_order', 'app_cancel_export_order', 'app_close_export_order',
      'app_create_shipment', 'app_mark_shipment_ready', 'app_dispatch_shipment', 'app_mark_shipment_delivered',
      'app_create_invoice', 'app_create_bill',
      'app_record_supplier_payment', 'app_allocate_payment', 'app_reverse_supplier_payment',
      'app_record_buyer_receipt', 'app_allocate_receipt', 'app_reverse_buyer_receipt')
  loop execute format('revoke all on function %s from public, anon, authenticated', fn.signature); end loop;
end;
$$;
grant execute on function
  public.app_create_buyer(text, text, text, text, text, text, text, text, text, text, text),
  public.app_update_buyer(uuid, text, text, text, text, text, text, text, text, text, text, text),
  public.app_set_buyer_active(uuid, boolean),
  public.app_create_export_order(uuid, text, text, text, date, date, text, jsonb),
  public.app_confirm_export_order(uuid), public.app_cancel_export_order(uuid), public.app_close_export_order(uuid),
  public.app_create_shipment(uuid, text, text, text, text, text, date, date, integer, numeric, numeric, text, text, jsonb),
  public.app_mark_shipment_ready(uuid), public.app_dispatch_shipment(uuid, date), public.app_mark_shipment_delivered(uuid),
  public.app_create_invoice(uuid, date, date, text, numeric, numeric, numeric, text, jsonb),
  public.app_create_bill(uuid, uuid, date, date, text, numeric, numeric, text, text),
  public.app_record_supplier_payment(uuid, text, date, numeric, numeric, text, text, text),
  public.app_allocate_payment(uuid, uuid, numeric), public.app_reverse_supplier_payment(uuid),
  public.app_record_buyer_receipt(uuid, text, date, numeric, numeric, text, text, text),
  public.app_allocate_receipt(uuid, uuid, numeric), public.app_reverse_buyer_receipt(uuid) to authenticated;
grant execute on function public.app_lot_available(uuid) to authenticated;

-- ---- Realtime -----------------------------------------------------------------
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.buyers, public.export_orders, public.shipments, public.export_invoices, public.supplier_bills;
  end if;
end;
$$;
commit;
