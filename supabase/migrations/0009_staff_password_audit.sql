-- 0009: Audit trail for administrator staff-password resets.
-- The Auth-side password update happens in the app layer (service role);
-- this RPC authorizes the actor and records the event. It exists because
-- app_log_audit is deliberately not executable by browser sessions.

create function public.app_log_staff_password_reset(p_target_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_profile public.profiles;
begin
  if not public.app_has_permission('users.manage') then raise exception 'Not authorized'; end if;
  select * into v_profile from public.profiles where id = p_target_user;
  if not found then raise exception 'Staff member not found'; end if;
  if v_profile.id = auth.uid()
    then raise exception 'Change your own password from Account security'; end if;
  insert into public.audit_events(actor_id, action, target, details)
    values (auth.uid(), 'staff.password_reset', p_target_user::text,
      jsonb_build_object('name', v_profile.full_name));
end;
$$;
revoke all on function public.app_log_staff_password_reset(uuid) from public;
grant execute on function public.app_log_staff_password_reset(uuid) to authenticated;
