-- 0011: Audit trail for administrator email verification of staff accounts.
-- An invited user who never opened the invitation email stays unconfirmed,
-- and GoTrue refuses password sign-in for unconfirmed users even when the
-- password itself is correct. Confirming the address is an Auth-side
-- (service role) write, so this RPC authorizes the actor and records the
-- event. It exists for the same reason as 0009: app_log_audit is deliberately
-- not executable by browser sessions.

create function public.app_log_staff_email_verify(p_target_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_profile public.profiles;
begin
  if not public.app_has_permission('users.manage') then raise exception 'Not authorized'; end if;
  select * into v_profile from public.profiles where id = p_target_user;
  if not found then raise exception 'Staff member not found'; end if;
  insert into public.audit_events(actor_id, action, target, details)
    values (auth.uid(), 'staff.email_verified', p_target_user::text,
      jsonb_build_object('name', v_profile.full_name, 'email', v_profile.email));
end;
$$;
revoke all on function public.app_log_staff_email_verify(uuid) from public;
grant execute on function public.app_log_staff_email_verify(uuid) to authenticated;
