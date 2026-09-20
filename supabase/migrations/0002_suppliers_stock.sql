-- Phase 2: suppliers, item catalogue, purchasing, goods receipts, and the stock ledger.
-- Apply once to a project that already has 0001_foundation.sql.
-- All writes are transactional, permission-checked, and audited. Stock is never edited directly:
-- balances are derived from the append-only stock_movements ledger.
begin;

create type public.item_category as enum ('raw_material', 'finished_product');
create type public.purchase_status as enum
  ('draft', 'confirmed', 'partially_received', 'received', 'cancelled');
create type public.movement_type as enum
  ('opening', 'receipt', 'adjustment_increase', 'adjustment_decrease',
   'production_consumption', 'production_output', 'dispatch');
create type public.adjustment_status as enum ('pending', 'approved', 'rejected');
create type public.adjustment_direction as enum ('increase', 'decrease');

create sequence public.supplier_code_seq;
create sequence public.raw_item_code_seq;
create sequence public.finished_item_code_seq;
create sequence public.purchase_code_seq;
create sequence public.receipt_code_seq;
create sequence public.adjustment_code_seq;
create sequence public.lot_code_seq;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) between 2 and 160),
  contact_person text not null default '' check (length(contact_person) <= 120),
  phone text not null default '' check (length(phone) <= 40),
  email text not null default '' check (email = '' or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  address text not null default '' check (length(address) <= 500),
  country text not null default '' check (length(country) <= 80),
  tax_id text not null default '' check (length(tax_id) <= 60),
  payment_terms text not null default '' check (length(payment_terms) <= 160),
  preferred_currency text not null default '' check (preferred_currency = '' or preferred_currency ~ '^[A-Z]{3}$'),
  notes text not null default '' check (length(notes) <= 2000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_name_idx on public.suppliers(lower(name));

-- Bank / payment details are isolated so only finance roles can read them.
create table public.supplier_payment_details (
  supplier_id uuid primary key references public.suppliers(id) on delete cascade,
  bank_name text not null default '' check (length(bank_name) <= 160),
  bank_account text not null default '' check (length(bank_account) <= 120),
  payment_notes text not null default '' check (length(payment_notes) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) between 2 and 160),
  category public.item_category not null,
  stock_unit text not null check (length(trim(stock_unit)) between 1 and 20),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  net_weight_kg numeric(14,3) check (net_weight_kg is null or net_weight_kg >= 0),
  packaging_spec text not null default '' check (length(packaging_spec) <= 200),
  notes text not null default '' check (length(notes) <= 2000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_name_idx on public.items(lower(name));
create index items_category_idx on public.items(category);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete restrict,
  lot_number text not null check (length(trim(lot_number)) between 1 and 60),
  supplier_id uuid references public.suppliers(id) on delete restrict,
  source_type text not null check (source_type in ('opening', 'purchase', 'production', 'adjustment')),
  source_id uuid,
  created_at timestamptz not null default now(),
  unique (item_id, lot_number)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  lot_id uuid references public.lots(id) on delete restrict,
  movement_type public.movement_type not null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  reference text not null default '' check (length(reference) <= 160),
  source_type text,
  source_id uuid,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index stock_movements_item_idx on public.stock_movements(item_id, created_at desc);
create index stock_movements_lot_idx on public.stock_movements(lot_id);
create index stock_movements_created_idx on public.stock_movements(created_at desc);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status public.purchase_status not null default 'draft',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  order_date date not null default current_date,
  expected_date date,
  notes text not null default '' check (length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_supplier_idx on public.purchases(supplier_id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  received_quantity numeric(14,3) not null default 0 check (received_quantity >= 0),
  notes text not null default '' check (length(notes) <= 500),
  check (received_quantity <= quantity)
);
create index purchase_lines_purchase_idx on public.purchase_lines(purchase_id);

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  receipt_date date not null default current_date,
  supplier_reference text not null default '' check (length(supplier_reference) <= 120),
  notes text not null default '' check (length(notes) <= 2000),
  received_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index goods_receipts_purchase_idx on public.goods_receipts(purchase_id);

create table public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_line_id uuid not null references public.purchase_lines(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  lot_id uuid references public.lots(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0)
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  item_id uuid not null references public.items(id) on delete restrict,
  lot_id uuid not null references public.lots(id) on delete restrict,
  direction public.adjustment_direction not null,
  quantity numeric(14,3) not null check (quantity > 0),
  reason text not null check (length(trim(reason)) between 3 and 500),
  status public.adjustment_status not null default 'pending',
  movement_id uuid references public.stock_movements(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz
);
create index stock_adjustments_status_idx on public.stock_adjustments(status, requested_at desc);

-- Seed the single v1 warehouse.
insert into public.warehouses(id, name)
  values (gen_random_uuid(), 'Main Warehouse');

create function public.app_default_warehouse() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare wid uuid;
begin
  select id into wid from public.warehouses where is_active order by created_at limit 1;
  if wid is null then raise exception 'No active warehouse is configured'; end if;
  return wid;
end;
$$;

create function public.app_log_audit(p_action text, p_target text, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_id, action, target, details)
    values (auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb));
end;
$$;

create function public.app_lot_on_hand(p_lot_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(quantity_delta), 0) from public.stock_movements where lot_id = p_lot_id;
$$;

-- ---- Suppliers -----------------------------------------------------------------
create function public.app_create_supplier(
  p_name text, p_contact_person text, p_phone text, p_email text, p_address text,
  p_country text, p_tax_id text, p_payment_terms text, p_preferred_currency text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text;
begin
  if not public.app_has_permission('suppliers.manage') then raise exception 'Not authorized'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Supplier name is required'; end if;
  v_code := 'SUP-' || lpad(nextval('public.supplier_code_seq')::text, 4, '0');
  insert into public.suppliers(code, name, contact_person, phone, email, address, country,
    tax_id, payment_terms, preferred_currency, notes, created_by)
    values (v_code, trim(p_name), trim(coalesce(p_contact_person, '')), trim(coalesce(p_phone, '')),
      lower(trim(coalesce(p_email, ''))), trim(coalesce(p_address, '')), trim(coalesce(p_country, '')),
      upper(trim(coalesce(p_tax_id, ''))), trim(coalesce(p_payment_terms, '')),
      upper(trim(coalesce(p_preferred_currency, ''))), trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_id;
  perform public.app_log_audit('supplier.created', v_id::text, jsonb_build_object('code', v_code, 'name', trim(p_name)));
  return v_id;
end;
$$;

create function public.app_update_supplier(
  p_id uuid, p_name text, p_contact_person text, p_phone text, p_email text, p_address text,
  p_country text, p_tax_id text, p_payment_terms text, p_preferred_currency text, p_notes text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('suppliers.manage') then raise exception 'Not authorized'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Supplier name is required'; end if;
  update public.suppliers set name = trim(p_name), contact_person = trim(coalesce(p_contact_person, '')),
    phone = trim(coalesce(p_phone, '')), email = lower(trim(coalesce(p_email, ''))),
    address = trim(coalesce(p_address, '')), country = trim(coalesce(p_country, '')),
    tax_id = upper(trim(coalesce(p_tax_id, ''))), payment_terms = trim(coalesce(p_payment_terms, '')),
    preferred_currency = upper(trim(coalesce(p_preferred_currency, ''))), notes = trim(coalesce(p_notes, '')),
    updated_at = now()
    where id = p_id;
  if not found then raise exception 'Supplier not found'; end if;
  perform public.app_log_audit('supplier.updated', p_id::text, '{}'::jsonb);
end;
$$;

create function public.app_set_supplier_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('suppliers.manage') then raise exception 'Not authorized'; end if;
  update public.suppliers set is_active = p_active, updated_at = now() where id = p_id;
  if not found then raise exception 'Supplier not found'; end if;
  -- History is always preserved; suppliers are deactivated, never deleted.
  perform public.app_log_audit('supplier.active_updated', p_id::text, jsonb_build_object('active', p_active));
end;
$$;

create function public.app_save_supplier_payment_details(
  p_supplier_id uuid, p_bank_name text, p_bank_account text, p_payment_notes text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('finance.manage') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.suppliers where id = p_supplier_id) then raise exception 'Supplier not found'; end if;
  insert into public.supplier_payment_details(supplier_id, bank_name, bank_account, payment_notes, updated_at)
    values (p_supplier_id, trim(coalesce(p_bank_name, '')), trim(coalesce(p_bank_account, '')),
      trim(coalesce(p_payment_notes, '')), now())
    on conflict(supplier_id) do update set bank_name = excluded.bank_name, bank_account = excluded.bank_account,
      payment_notes = excluded.payment_notes, updated_at = now();
  perform public.app_log_audit('supplier.payment_details_updated', p_supplier_id::text, '{}'::jsonb);
end;
$$;

-- ---- Items ---------------------------------------------------------------------
create function public.app_create_item(
  p_name text, p_category public.item_category, p_stock_unit text, p_reorder_level numeric,
  p_net_weight_kg numeric, p_packaging_spec text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text;
begin
  if not public.app_has_permission('inventory.manage') then raise exception 'Not authorized'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Item name is required'; end if;
  if length(trim(coalesce(p_stock_unit, ''))) < 1 then raise exception 'A stock unit is required'; end if;
  if p_category = 'raw_material'
    then v_code := 'RM-' || lpad(nextval('public.raw_item_code_seq')::text, 4, '0');
    else v_code := 'FP-' || lpad(nextval('public.finished_item_code_seq')::text, 4, '0');
  end if;
  insert into public.items(code, name, category, stock_unit, reorder_level, net_weight_kg, packaging_spec, notes, created_by)
    values (v_code, trim(p_name), p_category, lower(trim(p_stock_unit)), coalesce(p_reorder_level, 0),
      p_net_weight_kg, trim(coalesce(p_packaging_spec, '')), trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_id;
  perform public.app_log_audit('item.created', v_id::text, jsonb_build_object('code', v_code, 'name', trim(p_name)));
  return v_id;
end;
$$;

create function public.app_update_item(
  p_id uuid, p_name text, p_stock_unit text, p_reorder_level numeric,
  p_net_weight_kg numeric, p_packaging_spec text, p_notes text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('inventory.manage') then raise exception 'Not authorized'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Item name is required'; end if;
  if length(trim(coalesce(p_stock_unit, ''))) < 1 then raise exception 'A stock unit is required'; end if;
  update public.items set name = trim(p_name), stock_unit = lower(trim(p_stock_unit)),
    reorder_level = coalesce(p_reorder_level, 0), net_weight_kg = p_net_weight_kg,
    packaging_spec = trim(coalesce(p_packaging_spec, '')), notes = trim(coalesce(p_notes, '')), updated_at = now()
    where id = p_id;
  if not found then raise exception 'Item not found'; end if;
  perform public.app_log_audit('item.updated', p_id::text, '{}'::jsonb);
end;
$$;

create function public.app_set_item_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('inventory.manage') then raise exception 'Not authorized'; end if;
  update public.items set is_active = p_active, updated_at = now() where id = p_id;
  if not found then raise exception 'Item not found'; end if;
  perform public.app_log_audit('item.active_updated', p_id::text, jsonb_build_object('active', p_active));
end;
$$;

-- ---- Opening stock -------------------------------------------------------------
create function public.app_record_opening_stock(
  p_item_id uuid, p_quantity numeric, p_unit_cost numeric, p_lot_number text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_item public.items; v_lot uuid; v_number text;
begin
  if not public.app_has_permission('inventory.manage') then raise exception 'Not authorized'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Opening quantity must be greater than zero'; end if;
  select * into v_item from public.items where id = p_item_id;
  if not found then raise exception 'Item not found'; end if;
  v_number := nullif(trim(coalesce(p_lot_number, '')), '');
  if v_number is null then v_number := 'OPEN-' || lpad(nextval('public.lot_code_seq')::text, 5, '0'); end if;
  insert into public.lots(item_id, lot_number, source_type)
    values (v_item.id, v_number, 'opening')
    on conflict(item_id, lot_number) do nothing
    returning id into v_lot;
  if v_lot is null then
    select id into v_lot from public.lots where item_id = v_item.id and lot_number = v_number;
  end if;
  insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, unit_cost, reference, source_type, created_by)
    values (v_item.id, public.app_default_warehouse(), v_lot, 'opening', p_quantity, p_unit_cost, 'Opening balance', 'opening', auth.uid());
  perform public.app_log_audit('stock.opening_recorded', v_item.id::text, jsonb_build_object('quantity', p_quantity, 'lot', v_number));
  return v_lot;
end;
$$;

-- ---- Purchasing ----------------------------------------------------------------
create function public.app_recompute_purchase_status(p_purchase_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_received numeric;
begin
  select coalesce(sum(quantity), 0), coalesce(sum(received_quantity), 0)
    into v_total, v_received from public.purchase_lines where purchase_id = p_purchase_id;
  update public.purchases set updated_at = now(),
    status = case
      when status in ('draft', 'cancelled') then status
      when v_received <= 0 then 'confirmed'
      when v_received >= v_total then 'received'
      else 'partially_received' end
    where id = p_purchase_id;
end;
$$;

create function public.app_create_purchase(
  p_supplier_id uuid, p_currency text, p_order_date date, p_expected_date date, p_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_line jsonb; v_item public.items;
begin
  if not public.app_has_permission('purchasing.manage') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.suppliers where id = p_supplier_id and is_active)
    then raise exception 'Choose an active supplier'; end if;
  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then raise exception 'A valid currency is required'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one item line'; end if;
  v_code := 'PO-' || lpad(nextval('public.purchase_code_seq')::text, 4, '0');
  insert into public.purchases(code, supplier_id, currency, order_date, expected_date, notes, status, created_by)
    values (v_code, p_supplier_id, upper(p_currency), coalesce(p_order_date, current_date), p_expected_date,
      trim(coalesce(p_notes, '')), 'draft', auth.uid())
    returning id into v_id;
  for v_line in select jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id = (v_line->>'item_id')::uuid;
    if not found then raise exception 'Every line needs a valid item'; end if;
    if (v_line->>'quantity')::numeric <= 0 then raise exception 'Line quantity must be greater than zero'; end if;
    insert into public.purchase_lines(purchase_id, item_id, quantity, unit_price, notes)
      values (v_id, v_item.id, (v_line->>'quantity')::numeric, coalesce((v_line->>'unit_price')::numeric, 0),
        trim(coalesce(v_line->>'notes', '')));
  end loop;
  perform public.app_log_audit('purchase.created', v_id::text, jsonb_build_object('code', v_code));
  return v_id;
end;
$$;

create function public.app_confirm_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('purchasing.manage') then raise exception 'Not authorized'; end if;
  update public.purchases set status = 'confirmed', updated_at = now()
    where id = p_id and status = 'draft';
  if not found then raise exception 'Only a draft order can be confirmed'; end if;
  perform public.app_log_audit('purchase.confirmed', p_id::text, '{}'::jsonb);
end;
$$;

create function public.app_cancel_purchase(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('purchasing.manage') then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.purchase_lines where purchase_id = p_id and received_quantity > 0)
    then raise exception 'An order with received stock cannot be cancelled'; end if;
  update public.purchases set status = 'cancelled', updated_at = now()
    where id = p_id and status in ('draft', 'confirmed');
  if not found then raise exception 'This order cannot be cancelled'; end if;
  perform public.app_log_audit('purchase.cancelled', p_id::text, '{}'::jsonb);
end;
$$;

create function public.app_receive_goods(
  p_purchase_id uuid, p_receipt_date date, p_supplier_reference text, p_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_purchase public.purchases; v_line jsonb; v_pline public.purchase_lines;
  v_lot uuid; v_number text; v_qty numeric; v_remaining numeric; v_receipt uuid; v_code text;
begin
  if not public.app_has_permission('purchasing.manage') then raise exception 'Not authorized'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one received line'; end if;
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_purchase.status not in ('confirmed', 'partially_received')
    then raise exception 'Confirm the order before receiving goods'; end if;
  v_code := 'GR-' || lpad(nextval('public.receipt_code_seq')::text, 4, '0');
  insert into public.goods_receipts(code, purchase_id, supplier_id, receipt_date, supplier_reference, notes, received_by)
    values (v_code, v_purchase.id, v_purchase.supplier_id, coalesce(p_receipt_date, current_date),
      trim(coalesce(p_supplier_reference, '')), trim(coalesce(p_notes, '')), auth.uid())
    returning id into v_receipt;
  for v_line in select jsonb_array_elements(p_lines) loop
    select * into v_pline from public.purchase_lines where id = (v_line->>'purchase_line_id')::uuid
      and purchase_id = v_purchase.id for update;
    if not found then raise exception 'Received line does not match this order'; end if;
    v_qty := coalesce((v_line->>'quantity')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    v_remaining := v_pline.quantity - v_pline.received_quantity;
    if v_qty > v_remaining then raise exception 'Cannot receive more than the ordered quantity'; end if;
    v_number := nullif(trim(coalesce(v_line->>'lot_number', '')), '');
    if v_number is null then v_number := v_code || '-' || lpad(nextval('public.lot_code_seq')::text, 5, '0'); end if;
    insert into public.lots(item_id, lot_number, supplier_id, source_type, source_id)
      values (v_pline.item_id, v_number, v_purchase.supplier_id, 'purchase', v_purchase.id)
      on conflict(item_id, lot_number) do nothing
      returning id into v_lot;
    if v_lot is null then
      select id into v_lot from public.lots where item_id = v_pline.item_id and lot_number = v_number;
    end if;
    insert into public.goods_receipt_lines(receipt_id, purchase_line_id, item_id, lot_id, quantity, unit_cost)
      values (v_receipt, v_pline.id, v_pline.item_id, v_lot, v_qty, (v_line->>'unit_cost')::numeric);
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, unit_cost, reference, source_type, source_id, created_by)
      values (v_pline.item_id, public.app_default_warehouse(), v_lot, 'receipt', v_qty,
        (v_line->>'unit_cost')::numeric, v_code, 'goods_receipt', v_receipt, auth.uid());
    update public.purchase_lines set received_quantity = received_quantity + v_qty where id = v_pline.id;
  end loop;
  perform public.app_recompute_purchase_status(v_purchase.id);
  perform public.app_log_audit('goods.received', v_receipt::text, jsonb_build_object('code', v_code, 'purchase', v_purchase.code));
  return v_receipt;
end;
$$;

-- ---- Adjustments ---------------------------------------------------------------
create function public.app_request_adjustment(
  p_item_id uuid, p_lot_id uuid, p_direction public.adjustment_direction, p_quantity numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_lot public.lots;
begin
  if not public.app_has_permission('inventory.manage') then raise exception 'Not authorized'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Adjustment quantity must be greater than zero'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason is required'; end if;
  select * into v_lot from public.lots where id = p_lot_id and item_id = p_item_id;
  if not found then raise exception 'Lot not found for this item'; end if;
  if p_direction = 'decrease' and public.app_lot_on_hand(p_lot_id) < p_quantity
    then raise exception 'Insufficient stock: only % available in this lot', trim(to_char(public.app_lot_on_hand(p_lot_id), '999999990.999')); end if;
  v_code := 'ADJ-' || lpad(nextval('public.adjustment_code_seq')::text, 4, '0');
  insert into public.stock_adjustments(code, item_id, lot_id, direction, quantity, reason, requested_by)
    values (v_code, p_item_id, p_lot_id, p_direction, p_quantity, trim(p_reason), auth.uid())
    returning id into v_id;
  perform public.app_log_audit('adjustment.requested', v_id::text, jsonb_build_object('code', v_code, 'direction', p_direction));
  return v_id;
end;
$$;

create function public.app_decide_adjustment(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_adj public.stock_adjustments; v_movement uuid;
begin
  if not public.app_has_permission('inventory.approve') then raise exception 'Not authorized'; end if;
  select * into v_adj from public.stock_adjustments where id = p_id for update;
  if not found then raise exception 'Adjustment not found'; end if;
  if v_adj.status <> 'pending' then raise exception 'This adjustment has already been decided'; end if;
  if p_approve then
    if v_adj.direction = 'decrease' and public.app_lot_on_hand(v_adj.lot_id) < v_adj.quantity
      then raise exception 'Insufficient stock when approving this decrease'; end if;
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, reference, source_type, source_id, created_by)
      values (v_adj.item_id, public.app_default_warehouse(), v_adj.lot_id,
        case v_adj.direction when 'increase' then 'adjustment_increase'::public.movement_type else 'adjustment_decrease'::public.movement_type end,
        case v_adj.direction when 'increase' then v_adj.quantity else -v_adj.quantity end,
        v_adj.reason, 'adjustment', v_adj.id, auth.uid())
      returning id into v_movement;
    update public.stock_adjustments set status = 'approved', movement_id = v_movement,
      decided_by = auth.uid(), decided_at = now() where id = p_id;
    perform public.app_log_audit('adjustment.approved', p_id::text, jsonb_build_object('code', v_adj.code));
  else
    update public.stock_adjustments set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_id;
    perform public.app_log_audit('adjustment.rejected', p_id::text, jsonb_build_object('code', v_adj.code));
  end if;
end;
$$;

-- ---- Read models ---------------------------------------------------------------
create view public.stock_balances with (security_invoker = true) as
  select i.id as item_id, i.code, i.name, i.category, i.stock_unit, i.reorder_level, i.is_active,
    coalesce(sum(m.quantity_delta), 0) as on_hand,
    0::numeric as reserved,
    coalesce(sum(m.quantity_delta), 0) as available,
    case when coalesce(sum(m.quantity_delta), 0) <= i.reorder_level then true else false end as is_low
  from public.items i
  left join public.stock_movements m on m.item_id = i.id
  group by i.id;

create view public.stock_lot_balances with (security_invoker = true) as
  select l.id as lot_id, l.item_id, i.code as item_code, i.name as item_name, i.stock_unit,
    l.lot_number, l.supplier_id, s.name as supplier_name, l.source_type,
    coalesce(sum(m.quantity_delta), 0) as on_hand
  from public.lots l
  join public.items i on i.id = l.item_id
  left join public.suppliers s on s.id = l.supplier_id
  left join public.stock_movements m on m.lot_id = l.id
  group by l.id, i.code, i.name, i.stock_unit, s.name;

create view public.stock_movement_ledger with (security_invoker = true) as
  select m.id, m.item_id, i.code as item_code, i.name as item_name, i.stock_unit,
    m.lot_id, l.lot_number, m.warehouse_id, m.movement_type, m.quantity_delta, m.unit_cost,
    m.reference, m.created_at, p.full_name as created_by_name
  from public.stock_movements m
  join public.items i on i.id = m.item_id
  left join public.lots l on l.id = m.lot_id
  left join public.profiles p on p.id = m.created_by;

-- ---- Row level security --------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.supplier_payment_details enable row level security;
alter table public.items enable row level security;
alter table public.warehouses enable row level security;
alter table public.lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_lines enable row level security;
alter table public.stock_adjustments enable row level security;

revoke all on public.suppliers, public.supplier_payment_details, public.items, public.warehouses,
  public.lots, public.stock_movements, public.purchases, public.purchase_lines,
  public.goods_receipts, public.goods_receipt_lines, public.stock_adjustments from anon, authenticated;
grant select on public.suppliers, public.supplier_payment_details, public.items, public.warehouses, public.lots,
  public.stock_movements, public.purchases, public.purchase_lines, public.goods_receipts,
  public.goods_receipt_lines, public.stock_adjustments to authenticated;
grant select on public.stock_balances, public.stock_lot_balances, public.stock_movement_ledger to authenticated;

create policy suppliers_read on public.suppliers for select to authenticated
  using (public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage'));
create policy supplier_payment_read on public.supplier_payment_details for select to authenticated
  using (public.app_has_permission('finance.view'));
create policy items_read on public.items for select to authenticated using (public.app_is_active());
create policy warehouses_read on public.warehouses for select to authenticated using (public.app_is_active());
create policy lots_read on public.lots for select to authenticated using (public.app_is_active());
create policy movements_read on public.stock_movements for select to authenticated
  using (public.app_has_permission('inventory.view'));
create policy purchases_read on public.purchases for select to authenticated
  using (public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view') or public.app_has_permission('finance.view'));
create policy purchase_lines_read on public.purchase_lines for select to authenticated
  using (public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view') or public.app_has_permission('finance.view'));
create policy receipts_read on public.goods_receipts for select to authenticated
  using (public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view'));
create policy receipt_lines_read on public.goods_receipt_lines for select to authenticated
  using (public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view'));
create policy adjustments_read on public.stock_adjustments for select to authenticated
  using (public.app_has_permission('inventory.view') or public.app_has_permission('inventory.approve'));

-- Views apply the caller's row-level policies on their base tables.
alter view public.stock_balances set (security_invoker = true);
alter view public.stock_lot_balances set (security_invoker = true);
alter view public.stock_movement_ledger set (security_invoker = true);

-- Revoke default PUBLIC execution for the functions added in this migration only,
-- so Phase 1 helpers such as app_has_permission (used by RLS) keep their grants.
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'app_default_warehouse', 'app_log_audit', 'app_lot_on_hand', 'app_recompute_purchase_status',
      'app_create_supplier', 'app_update_supplier', 'app_set_supplier_active', 'app_save_supplier_payment_details',
      'app_create_item', 'app_update_item', 'app_set_item_active', 'app_record_opening_stock',
      'app_create_purchase', 'app_confirm_purchase', 'app_cancel_purchase', 'app_receive_goods',
      'app_request_adjustment', 'app_decide_adjustment')
  loop execute format('revoke all on function %s from public, anon, authenticated', fn.signature); end loop;
end;
$$;
grant execute on function
  public.app_create_supplier(text, text, text, text, text, text, text, text, text, text),
  public.app_update_supplier(uuid, text, text, text, text, text, text, text, text, text, text),
  public.app_set_supplier_active(uuid, boolean),
  public.app_save_supplier_payment_details(uuid, text, text, text),
  public.app_create_item(text, public.item_category, text, numeric, numeric, text, text),
  public.app_update_item(uuid, text, text, numeric, numeric, text, text),
  public.app_set_item_active(uuid, boolean),
  public.app_record_opening_stock(uuid, numeric, numeric, text),
  public.app_create_purchase(uuid, text, date, date, text, jsonb),
  public.app_confirm_purchase(uuid), public.app_cancel_purchase(uuid),
  public.app_receive_goods(uuid, date, text, text, jsonb),
  public.app_request_adjustment(uuid, uuid, public.adjustment_direction, numeric, text),
  public.app_decide_adjustment(uuid, boolean) to authenticated;

-- ---- Realtime ------------------------------------------------------------------
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.suppliers, public.items, public.purchases, public.goods_receipts,
      public.stock_movements, public.stock_adjustments;
  end if;
end;
$$;
commit;
