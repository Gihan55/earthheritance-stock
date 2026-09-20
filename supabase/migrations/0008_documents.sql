-- Private supporting documents: certificates, bills of lading, payment evidence.
-- Files live in a private "attachments" Storage bucket; this table records the
-- metadata and links each file to one business record. Reads go through RLS,
-- writes and deletes go through the app_* RPCs so every change is audited.
begin;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in
    ('purchase', 'goods_receipt', 'export_order', 'shipment', 'export_invoice',
     'supplier_bill', 'supplier_payment', 'buyer_receipt')),
  entity_id uuid not null,
  title text not null check (length(trim(title)) between 2 and 120),
  category text not null default 'other' check (category in
    ('certificate', 'transport', 'payment_evidence', 'tax', 'photo', 'other')),
  -- Storage object name: <entity_type>/<entity_id>/<random>-<file name>
  file_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 200),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  mime_type text not null check (mime_type in
    ('application/pdf', 'image/jpeg', 'image/png', 'image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (file_path ~ ('^' || entity_type || '/[0-9a-f-]{36}/[^/]+$'))
);
create index documents_entity_idx on public.documents(entity_type, entity_id);

-- Which role may see or attach documents for each record type.
create function public.app_document_read_ok(p_entity_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_has_permission(case p_entity_type
    when 'purchase' then 'inventory.view'
    when 'goods_receipt' then 'inventory.view'
    when 'export_order' then 'exports.view'
    when 'shipment' then 'exports.view'
    when 'export_invoice' then 'exports.view'
    else 'finance.view' end);
$$;
create function public.app_document_write_ok(p_entity_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_has_permission(case p_entity_type
    when 'purchase' then 'purchasing.manage'
    when 'goods_receipt' then 'purchasing.manage'
    when 'export_order' then 'exports.manage'
    when 'shipment' then 'exports.manage'
    when 'export_invoice' then 'exports.manage'
    else 'finance.manage' end);
$$;
revoke all on function public.app_document_read_ok(text) from public;
revoke all on function public.app_document_write_ok(text) from public;
grant execute on function public.app_document_read_ok(text) to anon, authenticated;
grant execute on function public.app_document_write_ok(text) to authenticated;

alter table public.documents enable row level security;
create policy documents_read on public.documents for select to authenticated
  using (public.app_is_active() and public.app_document_read_ok(entity_type));
grant select on public.documents to authenticated;

-- Attach a document after its file has been uploaded to Storage.
create function public.app_register_document(
  p_entity_type text, p_entity_id uuid, p_title text, p_category text,
  p_file_path text, p_file_name text, p_file_size_bytes bigint, p_mime_type text
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.app_document_write_ok(p_entity_type) then
    raise exception 'Not authorized for this document type';
  end if;
  if p_file_path is null or p_file_path !~ ('^' || p_entity_type || '/' || p_entity_id::text || '/') then
    raise exception 'File path must match the record it is attached to';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 10485760 then
    raise exception 'Documents must be between 1 byte and 10 MB';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then
    raise exception 'Unsupported file type';
  end if;
  if p_entity_type = 'purchase' and not exists (select 1 from public.purchases where id = p_entity_id) then raise exception 'Record not found'; end if;
  if p_entity_type = 'goods_receipt' and not exists (select 1 from public.goods_receipts where id = p_entity_id) then raise exception 'Record not found'; end if;
  if p_entity_type = 'export_order' and not exists (select 1 from public.export_orders where id = p_entity_id) then raise exception 'Record not found'; end if;
  if p_entity_type = 'shipment' and not exists (select 1 from public.shipments where id = p_entity_id) then raise exception 'Record not found'; end if;
  if p_entity_type = 'export_invoice' and not exists (select 1 from public.export_invoices where id = p_entity_id) then raise exception 'Record not found'; end if;
  if p_entity_type = 'supplier_bill' and not exists (select 1 from public.supplier_bills where id = p_entity_id) then raise exception 'Record not found'; end if;
  if p_entity_type = 'supplier_payment' and not exists (select 1 from public.supplier_payments where id = p_entity_id) then raise exception 'Record not found'; end if;
  if p_entity_type = 'buyer_receipt' and not exists (select 1 from public.buyer_receipts where id = p_entity_id) then raise exception 'Record not found'; end if;
  insert into public.documents(entity_type, entity_id, title, category, file_path, file_name, file_size_bytes, mime_type, uploaded_by)
    values (p_entity_type, p_entity_id, trim(p_title), p_category, p_file_path, p_file_name, p_file_size_bytes, p_mime_type, auth.uid())
    returning id into v_id;
  insert into public.audit_events(actor_id, action, target, details)
    values (auth.uid(), 'document.added', v_id::text,
      jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id, 'file_name', p_file_name));
  return v_id;
end;
$$;

-- Remove a document row and its Storage object. The storage branch is skipped
-- on test databases (PGlite) that have no Storage schema.
create function public.app_remove_document(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare doc public.documents;
begin
  select * into doc from public.documents where id = p_id for update;
  if not found then raise exception 'Document not found'; end if;
  if not public.app_document_write_ok(doc.entity_type) then
    raise exception 'Not authorized for this document type';
  end if;
  if to_regnamespace('storage') is not null then
    execute 'delete from storage.objects where bucket_id = ''attachments'' and name = $1'
      using doc.file_path;
  end if;
  delete from public.documents where id = p_id;
  insert into public.audit_events(actor_id, action, target, details)
    values (auth.uid(), 'document.removed', p_id::text,
      jsonb_build_object('entity_type', doc.entity_type, 'file_name', doc.file_name));
end;
$$;
revoke all on function public.app_register_document(text, uuid, text, text, text, text, bigint, text) from public;
revoke all on function public.app_remove_document(uuid) from public;
grant execute on function public.app_register_document(text, uuid, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.app_remove_document(uuid) to authenticated;

-- Private bucket + path-scoped Storage policies. Guarded so databases without
-- the storage schema (local PGlite tests) apply this migration unchanged.
do $setup$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  execute $$insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
    on conflict (id) do nothing$$;
  execute 'drop policy if exists "attachments_read" on storage.objects';
  execute 'create policy "attachments_read" on storage.objects for select to authenticated
    using (bucket_id = ''attachments'' and public.app_is_active()
      and public.app_document_read_ok(split_part(name, ''/'', 1)))';
  execute 'drop policy if exists "attachments_upload" on storage.objects';
  execute 'create policy "attachments_upload" on storage.objects for insert to authenticated
    with check (bucket_id = ''attachments'' and owner = (select auth.uid())
      and public.app_document_write_ok(split_part(name, ''/'', 1)))';
  execute 'drop policy if exists "attachments_delete" on storage.objects';
  execute 'create policy "attachments_delete" on storage.objects for delete to authenticated
    using (bucket_id = ''attachments''
      and public.app_document_write_ok(split_part(name, ''/'', 1)))';
end;
$setup$;

commit;
