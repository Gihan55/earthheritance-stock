-- Apply once to a new Supabase project using its SQL editor or migration CLI.
-- Disable public sign-ups in Supabase Auth. Never use user_metadata for roles.
begin;

create type public.app_role as enum ('administrator', 'manager', 'stores', 'production', 'export_sales', 'finance');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  role public.app_role not null,
  is_active boolean not null default true,
  security_revision integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.permission_catalog (
  key text primary key,
  admin_only boolean not null default false
);
insert into public.permission_catalog(key, admin_only) values
  ('suppliers.view', false), ('suppliers.manage', false), ('purchasing.manage', false),
  ('inventory.view', false), ('inventory.manage', false), ('inventory.approve', false),
  ('production.view', false), ('production.manage', false), ('buyers.view', false),
  ('buyers.manage', false), ('exports.view', false), ('exports.manage', false),
  ('finance.view', false), ('finance.manage', false), ('reports.view', false), ('audit.view', false),
  ('users.manage', true), ('roles.manage', true), ('settings.manage', true);
create table public.role_permissions (
  role public.app_role not null,
  permission text not null references public.permission_catalog(key),
  primary key(role, permission)
);
insert into public.role_permissions select 'administrator'::public.app_role, key from public.permission_catalog;
insert into public.role_permissions(role, permission) values
  ('manager', 'suppliers.view'), ('manager', 'inventory.view'), ('manager', 'inventory.approve'),
  ('manager', 'production.view'), ('manager', 'buyers.view'), ('manager', 'exports.view'),
  ('manager', 'finance.view'), ('manager', 'reports.view'), ('manager', 'audit.view'),
  ('stores', 'suppliers.view'), ('stores', 'suppliers.manage'), ('stores', 'purchasing.manage'),
  ('stores', 'inventory.view'), ('stores', 'inventory.manage'),
  ('production', 'inventory.view'), ('production', 'production.view'), ('production', 'production.manage'),
  ('export_sales', 'buyers.view'), ('export_sales', 'buyers.manage'), ('export_sales', 'exports.view'),
  ('export_sales', 'exports.manage'), ('export_sales', 'inventory.view'),
  ('finance', 'suppliers.view'), ('finance', 'buyers.view'), ('finance', 'exports.view'),
  ('finance', 'finance.view'), ('finance', 'finance.manage'), ('finance', 'reports.view');

create table public.company_settings (
  id boolean primary key default true check (id),
  name text not null check (length(trim(name)) between 2 and 160),
  email text not null default '' check (length(email) <= 254),
  phone text not null default '' check (length(phone) <= 40),
  address text not null default '' check (length(address) <= 500),
  country text not null check (length(trim(country)) between 2 and 80),
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  warehouse_name text not null check (length(trim(warehouse_name)) between 2 and 100),
  updated_at timestamptz not null default now()
);
create table public.staff_invitations (
  email text primary key check (email = lower(trim(email)) and length(email) <= 254 and email like '%@%'),
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  role public.app_role not null,
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete restrict,
  action text not null,
  target text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_created_at on public.audit_events(created_at desc);

create function public.app_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active);
$$;
create function public.app_has_permission(required_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active
    and (p.role = 'administrator' or exists (
      select 1 from public.role_permissions rp where rp.role = p.role and rp.permission = required_permission
    ))
  );
$$;

alter table public.profiles enable row level security;
alter table public.permission_catalog enable row level security;
alter table public.role_permissions enable row level security;
alter table public.company_settings enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.audit_events enable row level security;

-- No browser role receives direct write privileges; RPCs authorize and audit writes.
revoke all on public.profiles, public.permission_catalog, public.role_permissions,
  public.company_settings, public.staff_invitations, public.audit_events from anon, authenticated;
grant select on public.profiles, public.permission_catalog, public.role_permissions,
  public.company_settings, public.staff_invitations, public.audit_events to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_has_permission('users.manage'));
create policy catalog_read on public.permission_catalog for select to authenticated using (public.app_is_active());
create policy permissions_read on public.role_permissions for select to authenticated using (public.app_is_active());
create policy company_read on public.company_settings for select to authenticated using (public.app_is_active());
create policy invitations_read on public.staff_invitations for select to authenticated using (public.app_has_permission('users.manage'));
create policy audit_read on public.audit_events for select to authenticated using (public.app_has_permission('audit.view'));

create function public.app_save_company(
  company_name text, company_email text, company_phone text, company_address text,
  company_country text, currency text, warehouse text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('settings.manage') then raise exception 'Not authorized'; end if;
  insert into public.company_settings(id, name, email, phone, address, country, base_currency, warehouse_name)
    values (true, trim(company_name), trim(company_email), trim(company_phone), trim(company_address), trim(company_country), upper(trim(currency)), trim(warehouse))
    on conflict(id) do update set name = excluded.name, email = excluded.email, phone = excluded.phone,
      address = excluded.address, country = excluded.country, base_currency = excluded.base_currency,
      warehouse_name = excluded.warehouse_name, updated_at = now();
  insert into public.audit_events(actor_id, action, target) values (auth.uid(), 'company.updated', 'company');
end;
$$;

create function public.app_set_staff_access(target_user uuid, new_role public.app_role, active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare old_profile public.profiles;
begin
  -- Serialize administrator changes so concurrent demotions cannot remove the last admin.
  perform pg_advisory_xact_lock(845132);
  if not public.app_has_permission('users.manage') then raise exception 'Not authorized'; end if;
  select * into old_profile from public.profiles where id = target_user for update;
  if not found then raise exception 'Staff member not found'; end if;
  if old_profile.role = 'administrator' and old_profile.is_active and (new_role <> 'administrator' or not active)
    and not exists (select 1 from public.profiles where role = 'administrator' and is_active and id <> target_user)
  then raise exception 'Keep at least one active administrator'; end if;
  update public.profiles set role = new_role, is_active = active, security_revision = security_revision + 1 where id = target_user;
  insert into public.audit_events(actor_id, action, target, details) values
    (auth.uid(), 'staff.access_updated', target_user::text,
      jsonb_build_object('previous_role', old_profile.role, 'role', new_role, 'previous_active', old_profile.is_active, 'active', active));
end;
$$;

create function public.app_set_role_permissions(target_role public.app_role, selected_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(845132);
  if not public.app_has_permission('roles.manage') then raise exception 'Not authorized'; end if;
  if target_role = 'administrator' then raise exception 'Administrator permissions are protected'; end if;
  if selected_permissions is null or exists (
    select 1 from unnest(selected_permissions) p left join public.permission_catalog c on c.key = p
    where c.key is null or c.admin_only
  ) then raise exception 'Invalid or protected permission'; end if;
  delete from public.role_permissions where role = target_role;
  insert into public.role_permissions(role, permission) select target_role, p from (select distinct unnest(selected_permissions) p) selected;
  update public.profiles set security_revision = security_revision + 1 where role = target_role;
  insert into public.audit_events(actor_id, action, target, details) values
    (auth.uid(), 'role.permissions_updated', target_role::text, jsonb_build_object('permissions', selected_permissions));
end;
$$;

create function public.app_prepare_invitation(staff_email text, staff_name text, staff_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('users.manage') then raise exception 'Not authorized'; end if;
  if exists(select 1 from auth.users where lower(email) = lower(trim(staff_email)))
    then raise exception 'This email already has an account. Manage its access or resend its invitation from Supabase Auth.'; end if;
  insert into public.staff_invitations(email, full_name, role, invited_by)
    values (lower(trim(staff_email)), trim(staff_name), staff_role, auth.uid())
    on conflict(email) do update set full_name = excluded.full_name, role = excluded.role,
      invited_by = excluded.invited_by, created_at = now();
  insert into public.audit_events(actor_id, action, target) values (auth.uid(), 'staff.invitation_prepared', lower(trim(staff_email)));
end;
$$;

create function public.app_cancel_invitation(staff_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_has_permission('users.manage') then raise exception 'Not authorized'; end if;
  delete from public.staff_invitations where email = lower(trim(staff_email));
  insert into public.audit_events(actor_id, action, target) values (auth.uid(), 'staff.invitation_cancelled', lower(trim(staff_email)));
end;
$$;

create function public.app_enroll_invited_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare invitation public.staff_invitations;
begin
  select * into invitation from public.staff_invitations where email = lower(new.email) for update;
  if found and invitation.created_at > now() - interval '1 day'
    and exists(select 1 from public.profiles where id = invitation.invited_by and is_active and role = 'administrator') then
    insert into public.profiles(id, email, full_name, role) values (new.id, lower(new.email), invitation.full_name, invitation.role);
    delete from public.staff_invitations where email = invitation.email;
    insert into public.audit_events(actor_id, action, target, details)
      values (invitation.invited_by, 'staff.invited', new.id::text, jsonb_build_object('role', invitation.role));
  end if;
  return new;
end;
$$;
create trigger enroll_invited_user after insert on auth.users for each row execute function public.app_enroll_invited_user();

-- Run only in the SQL editor after creating the first user in Supabase Auth:
-- select public.app_bootstrap_admin('AUTH_USER_UUID', 'Your full name');
-- This RPC is intentionally unavailable to browsers and normal signed-in users.
create function public.app_bootstrap_admin(user_id uuid, admin_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare admin_email text;
begin
  perform pg_advisory_xact_lock(845132);
  if exists(select 1 from public.profiles) then raise exception 'Already initialized'; end if;
  select email into admin_email from auth.users where id = user_id;
  if admin_email is null then raise exception 'Create the user in Supabase Auth first'; end if;
  insert into public.profiles(id, email, full_name, role) values (user_id, lower(admin_email), trim(admin_name), 'administrator');
  insert into public.audit_events(actor_id, action, target) values (user_id, 'company.initialized', user_id::text);
end;
$$;

-- Revoke PostgreSQL's default PUBLIC function execution for every app function.
do $$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'app\_%' escape '\'
  loop execute format('revoke all on function %s from public, anon, authenticated', fn.signature); end loop;
end;
$$;
grant execute on function public.app_is_active(), public.app_has_permission(text),
  public.app_save_company(text, text, text, text, text, text, text),
  public.app_set_staff_access(uuid, public.app_role, boolean),
  public.app_set_role_permissions(public.app_role, text[]),
  public.app_prepare_invitation(text, text, public.app_role), public.app_cancel_invitation(text) to authenticated;
grant execute on function public.app_bootstrap_admin(uuid, text) to service_role;

-- Supabase Realtime applies SELECT policies to these change notifications.
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.company_settings, public.profiles, public.role_permissions;
  end if;
end;
$$;
commit;
