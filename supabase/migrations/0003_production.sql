-- Phase 3: basic production. Batches consume raw-material lots and create finished-product
-- lots together, atomically, in one transaction. Posting is audited and reversible only while
-- the produced lots are untouched. Traceability links finished lots back to supplier lots.
-- Apply once to a project that already has 0001 and 0002.
begin;

create type public.batch_status as enum ('draft', 'posted', 'reversed');
create sequence public.batch_code_seq;

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status public.batch_status not null default 'draft',
  produced_on date not null default current_date,
  produced_by uuid references public.profiles(id) on delete restrict,
  notes text not null default '' check (length(notes) <= 2000),
  posted_at timestamptz,
  posted_by uuid references public.profiles(id) on delete restrict,
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index production_batches_status_idx on public.production_batches(status, created_at desc);

create table public.production_inputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  lot_id uuid not null references public.lots(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  movement_id uuid references public.stock_movements(id) on delete set null
);
create index production_inputs_batch_idx on public.production_inputs(batch_id);

create table public.production_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  lot_id uuid references public.lots(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  movement_id uuid references public.stock_movements(id) on delete set null
);
create index production_outputs_batch_idx on public.production_outputs(batch_id);

create table public.production_wastage (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_batches(id) on delete cascade,
  item_id uuid references public.items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 20),
  reason text not null check (length(trim(reason)) between 2 and 200)
);
create index production_wastage_batch_idx on public.production_wastage(batch_id);

-- Link a produced lot back to the batch that created it, for traceability.
alter table public.lots
  add column produced_batch_id uuid references public.production_batches(id) on delete restrict;

-- ---- Batch lifecycle -----------------------------------------------------------
create function public.app_create_batch(
  p_produced_on date, p_notes text, p_inputs jsonb, p_outputs jsonb, p_wastage jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_line jsonb; v_item public.items;
begin
  if not public.app_has_permission('production.manage') then raise exception 'Not authorized'; end if;
  v_code := 'PB-' || lpad(nextval('public.batch_code_seq')::text, 4, '0');
  insert into public.production_batches(code, produced_on, notes, status, produced_by)
    values (v_code, coalesce(p_produced_on, current_date), trim(coalesce(p_notes, '')), 'draft', auth.uid())
    returning id into v_id;
  if p_inputs is not null then
    for v_line in select jsonb_array_elements(p_inputs) loop
      select * into v_item from public.items where id = (v_line->>'item_id')::uuid;
      if not found then raise exception 'Every input line needs a valid item'; end if;
      if v_item.category <> 'raw_material' then raise exception 'Production inputs must be raw materials'; end if;
      if (v_line->>'quantity')::numeric <= 0 then raise exception 'Input quantity must be greater than zero'; end if;
      if not exists(select 1 from public.lots where id = (v_line->>'lot_id')::uuid and item_id = v_item.id)
        then raise exception 'Input lot not found for this item'; end if;
      insert into public.production_inputs(batch_id, item_id, lot_id, quantity)
        values (v_id, v_item.id, (v_line->>'lot_id')::uuid, (v_line->>'quantity')::numeric);
    end loop;
  end if;
  if p_outputs is not null then
    for v_line in select jsonb_array_elements(p_outputs) loop
      select * into v_item from public.items where id = (v_line->>'item_id')::uuid;
      if not found then raise exception 'Every output line needs a valid item'; end if;
      if v_item.category <> 'finished_product' then raise exception 'Production outputs must be finished products'; end if;
      if (v_line->>'quantity')::numeric <= 0 then raise exception 'Output quantity must be greater than zero'; end if;
      insert into public.production_outputs(batch_id, item_id, quantity, unit_cost)
        values (v_id, v_item.id, (v_line->>'quantity')::numeric, (v_line->>'unit_cost')::numeric);
    end loop;
  end if;
  if p_wastage is not null then
    for v_line in select jsonb_array_elements(p_wastage) loop
      if (v_line->>'quantity')::numeric <= 0 then raise exception 'Wastage quantity must be greater than zero'; end if;
      insert into public.production_wastage(batch_id, item_id, quantity, unit, reason)
        values (v_id, nullif(v_line->>'item_id', '')::uuid, (v_line->>'quantity')::numeric,
          trim(coalesce(v_line->>'unit', '')), trim(coalesce(v_line->>'reason', '')));
    end loop;
  end if;
  perform public.app_log_audit('production.created', v_id::text, jsonb_build_object('code', v_code));
  return v_id;
end;
$$;

create function public.app_replace_batch_lines(
  p_id uuid, p_inputs jsonb, p_outputs jsonb, p_wastage jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_line jsonb; v_item public.items;
begin
  if not public.app_has_permission('production.manage') then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.production_batches where id = p_id and status = 'draft')
    then raise exception 'Only a draft batch can be edited'; end if;
  delete from public.production_inputs where batch_id = p_id;
  delete from public.production_outputs where batch_id = p_id;
  delete from public.production_wastage where batch_id = p_id;
  for v_line in select jsonb_array_elements(coalesce(p_inputs, '[]'::jsonb)) loop
    select * into v_item from public.items where id = (v_line->>'item_id')::uuid;
    if not found or v_item.category <> 'raw_material' then raise exception 'Every input line needs a valid raw material'; end if;
    if (v_line->>'quantity')::numeric <= 0 then raise exception 'Input quantity must be greater than zero'; end if;
    if not exists(select 1 from public.lots where id = (v_line->>'lot_id')::uuid and item_id = v_item.id)
      then raise exception 'Input lot not found for this item'; end if;
    insert into public.production_inputs(batch_id, item_id, lot_id, quantity)
      values (p_id, v_item.id, (v_line->>'lot_id')::uuid, (v_line->>'quantity')::numeric);
  end loop;
  for v_line in select jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb)) loop
    select * into v_item from public.items where id = (v_line->>'item_id')::uuid;
    if not found or v_item.category <> 'finished_product' then raise exception 'Every output line needs a valid finished product'; end if;
    if (v_line->>'quantity')::numeric <= 0 then raise exception 'Output quantity must be greater than zero'; end if;
    insert into public.production_outputs(batch_id, item_id, quantity, unit_cost)
      values (p_id, v_item.id, (v_line->>'quantity')::numeric, (v_line->>'unit_cost')::numeric);
  end loop;
  for v_line in select jsonb_array_elements(coalesce(p_wastage, '[]'::jsonb)) loop
    if (v_line->>'quantity')::numeric <= 0 then raise exception 'Wastage quantity must be greater than zero'; end if;
    insert into public.production_wastage(batch_id, item_id, quantity, unit, reason)
      values (p_id, nullif(v_line->>'item_id', '')::uuid, (v_line->>'quantity')::numeric,
        trim(coalesce(v_line->>'unit', '')), trim(coalesce(v_line->>'reason', '')));
  end loop;
  update public.production_batches set updated_at = now() where id = p_id;
  perform public.app_log_audit('production.updated', p_id::text, '{}'::jsonb);
end;
$$;

create function public.app_post_batch(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_batch public.production_batches; v_in public.production_inputs; v_out public.production_outputs;
  v_lot public.lots; v_number text; v_new_lot uuid; v_wh uuid;
begin
  if not public.app_has_permission('production.manage') then raise exception 'Not authorized'; end if;
  select * into v_batch from public.production_batches where id = p_id for update;
  if not found then raise exception 'Batch not found'; end if;
  if v_batch.status <> 'draft' then raise exception 'Only a draft batch can be posted'; end if;
  if not exists(select 1 from public.production_inputs where batch_id = p_id)
    then raise exception 'Add at least one input material'; end if;
  if not exists(select 1 from public.production_outputs where batch_id = p_id)
    then raise exception 'Add at least one output product'; end if;
  v_wh := public.app_default_warehouse();
  -- Consume inputs first, checking stock under a row lock so nothing else can take it.
  for v_in in select * from public.production_inputs where batch_id = p_id order by id loop
    select * into v_lot from public.lots where id = v_in.lot_id for update;
    if not found then raise exception 'Input lot no longer exists'; end if;
    if public.app_lot_on_hand(v_in.lot_id) < v_in.quantity
      then raise exception 'Insufficient stock: only % available in lot %',
        trim(to_char(public.app_lot_on_hand(v_in.lot_id), '999999990.999')), v_lot.lot_number; end if;
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, reference, source_type, source_id, created_by)
      values (v_in.item_id, v_wh, v_in.lot_id, 'production_consumption', -v_in.quantity, v_batch.code, 'production_input', v_in.id, auth.uid())
      returning id into v_in.movement_id;
    update public.production_inputs set movement_id = v_in.movement_id where id = v_in.id;
  end loop;
  -- Then create finished-product lots and add their stock, in the same transaction.
  for v_out in select * from public.production_outputs where batch_id = p_id order by id loop
    v_number := v_batch.code || '-' || lpad(nextval('public.lot_code_seq')::text, 5, '0');
    insert into public.lots(item_id, lot_number, source_type, source_id, produced_batch_id)
      values (v_out.item_id, v_number, 'production', v_batch.id, v_batch.id)
      returning id into v_new_lot;
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, unit_cost, reference, source_type, source_id, created_by)
      values (v_out.item_id, v_wh, v_new_lot, 'production_output', v_out.quantity, v_out.unit_cost, v_batch.code, 'production_output', v_out.id, auth.uid())
      returning id into v_out.movement_id;
    update public.production_outputs set lot_id = v_new_lot, movement_id = v_out.movement_id where id = v_out.id;
  end loop;
  update public.production_batches set status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_at = now()
    where id = p_id;
  perform public.app_log_audit('production.posted', p_id::text, jsonb_build_object('code', v_batch.code));
end;
$$;

create function public.app_reverse_batch(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_batch public.production_batches; v_in public.production_inputs; v_out public.production_outputs; v_wh uuid;
begin
  if not public.app_has_permission('production.manage') then raise exception 'Not authorized'; end if;
  select * into v_batch from public.production_batches where id = p_id for update;
  if not found then raise exception 'Batch not found'; end if;
  if v_batch.status <> 'posted' then raise exception 'Only a posted batch can be reversed'; end if;
  -- Refuse reversal once any produced lot has been consumed or dispatched elsewhere.
  select o.id into v_out from public.production_outputs o
    join public.stock_movements m on m.lot_id = o.lot_id and m.movement_type <> 'production_output'
    where o.batch_id = p_id limit 1;
  if found then raise exception 'Produced stock has already been used; reverse those records first'; end if;
  v_wh := public.app_default_warehouse();
  for v_out in select * from public.production_outputs where batch_id = p_id and lot_id is not null loop
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, reference, source_type, source_id, created_by)
      values (v_out.item_id, v_wh, v_out.lot_id, 'production_output', -v_out.quantity, v_batch.code || ' reversal', 'production_reverse', v_out.id, auth.uid());
  end loop;
  for v_in in select * from public.production_inputs where batch_id = p_id loop
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, reference, source_type, source_id, created_by)
      values (v_in.item_id, v_wh, v_in.lot_id, 'production_consumption', v_in.quantity, v_batch.code || ' reversal', 'production_reverse', v_in.id, auth.uid());
  end loop;
  update public.production_batches set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), updated_at = now()
    where id = p_id;
  perform public.app_log_audit('production.reversed', p_id::text, jsonb_build_object('code', v_batch.code));
end;
$$;

-- ---- Read models ---------------------------------------------------------------
create view public.production_lot_inputs with (security_invoker = true) as
  select i.batch_id, i.item_id as input_item_id, ii.name as input_item_name, ii.code as input_item_code,
    i.lot_id, l.lot_number as input_lot_number, l.supplier_id, s.name as supplier_name,
    l.source_type as input_source_type, i.quantity
  from public.production_inputs i
  join public.items ii on ii.id = i.item_id
  join public.lots l on l.id = i.lot_id
  left join public.suppliers s on s.id = l.supplier_id;

create view public.production_traceability with (security_invoker = true) as
  select o.lot_id as finished_lot_id, fl.lot_number as finished_lot_number,
    o.item_id as finished_item_id, fi.name as finished_item_name, fi.code as finished_item_code,
    b.id as batch_id, b.code as batch_code, b.produced_on,
    li.input_lot_id, li.input_lot_number, li.input_item_id, li.input_item_name,
    li.supplier_id, li.supplier_name
  from public.production_outputs o
  join public.production_batches b on b.id = o.batch_id
  join public.lots fl on fl.id = o.lot_id
  join public.items fi on fi.id = o.item_id
  left join (
    select i.batch_id, i.lot_id as input_lot_id, l.lot_number as input_lot_number,
      i.item_id as input_item_id, it.name as input_item_name, l.supplier_id, s.name as supplier_name
    from public.production_inputs i
    join public.lots l on l.id = i.lot_id
    join public.items it on it.id = i.item_id
    left join public.suppliers s on s.id = l.supplier_id
  ) li on li.batch_id = b.id;

-- ---- Row level security --------------------------------------------------------
alter table public.production_batches enable row level security;
alter table public.production_inputs enable row level security;
alter table public.production_outputs enable row level security;
alter table public.production_wastage enable row level security;

revoke all on public.production_batches, public.production_inputs, public.production_outputs,
  public.production_wastage from anon, authenticated;
grant select on public.production_batches, public.production_inputs, public.production_outputs,
  public.production_wastage to authenticated;
grant select on public.production_lot_inputs, public.production_traceability to authenticated;

create policy batches_read on public.production_batches for select to authenticated
  using (public.app_has_permission('production.view') or public.app_has_permission('production.manage'));
create policy batch_inputs_read on public.production_inputs for select to authenticated
  using (public.app_has_permission('production.view') or public.app_has_permission('production.manage'));
create policy batch_outputs_read on public.production_outputs for select to authenticated
  using (public.app_has_permission('production.view') or public.app_has_permission('production.manage'));
create policy batch_wastage_read on public.production_wastage for select to authenticated
  using (public.app_has_permission('production.view') or public.app_has_permission('production.manage'));

alter view public.production_lot_inputs set (security_invoker = true);
alter view public.production_traceability set (security_invoker = true);

-- ---- Grants --------------------------------------------------------------------
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'app_create_batch', 'app_replace_batch_lines', 'app_post_batch', 'app_reverse_batch')
  loop execute format('revoke all on function %s from public, anon, authenticated', fn.signature); end loop;
end;
$$;
grant execute on function
  public.app_create_batch(date, text, jsonb, jsonb, jsonb),
  public.app_replace_batch_lines(uuid, jsonb, jsonb, jsonb),
  public.app_post_batch(uuid), public.app_reverse_batch(uuid) to authenticated;

-- ---- Realtime ------------------------------------------------------------------
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.production_batches;
  end if;
end;
$$;
commit;
