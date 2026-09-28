import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "./supabase/server";
import { isLocalPreview, isSupabaseConfigured } from "./supabase/config";
import {
  DEFAULT_PERMISSIONS,
  PERMISSIONS,
  type Permission,
  type Role,
} from "./permissions";

export type StaffProfile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};
export type Actor = {
  profile: StaffProfile;
  permissions: Permission[];
  preview: boolean;
};
export type Company = {
  name: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  base_currency: string;
  warehouse_name: string;
};
export type AuditEvent = {
  id: string;
  action: string;
  target: string;
  created_at: string;
};
export type Invitation = {
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
};

export const getActor = cache(async (): Promise<Actor | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,is_active,created_at")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active) return null;
  const { data: rows, error: permissionsError } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("role", profile.role);
  if (permissionsError) return null;
  const permissions = (rows ?? [])
    .map((row) => row.permission)
    .filter((key): key is Permission => key in PERMISSIONS);
  return { profile: profile as StaffProfile, permissions, preview: false };
});
export const requireActor = cache(async (): Promise<Actor> => {
  if (isLocalPreview())
    return {
      profile: {
        id: "preview",
        full_name: "Workspace preview",
        email: "No account connected",
        role: "administrator",
        is_active: true,
        created_at: "",
      },
      permissions: DEFAULT_PERMISSIONS.administrator,
      preview: true,
    };
  if (!isSupabaseConfigured()) redirect("/login?reason=setup");
  const actor = await getActor();
  if (!actor) redirect("/login?reason=access");
  return actor;
});
export async function requirePermission(permission: Permission) {
  const actor = await requireActor();
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}
export const getCompany = cache(async (): Promise<Company | null> => {
  const actor = await requireActor();
  if (actor.preview) return null;
  const { data, error } = await (await createServerSupabase())
    .from("company_settings")
    .select("name,email,phone,address,country,base_currency,warehouse_name")
    .maybeSingle();
  if (error) throw new Error("Company settings could not be loaded.");
  return data as Company | null;
});
export async function getStaff(): Promise<StaffProfile[]> {
  const actor = await requirePermission("users.manage");
  if (actor.preview) return [];
  const { data, error } = await (await createServerSupabase())
    .from("profiles")
    .select("id,full_name,email,role,is_active,created_at")
    .order("created_at");
  if (error) throw new Error("Staff could not be loaded.");
  return data as StaffProfile[];
}
export async function getInvitations(): Promise<Invitation[]> {
  const actor = await requirePermission("users.manage");
  if (actor.preview) return [];
  const { data, error } = await (await createServerSupabase())
    .from("staff_invitations")
    .select("email,full_name,role,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Invitations could not be loaded.");
  return data as Invitation[];
}
/**
 * Which staff accounts are still waiting for email confirmation, keyed by user
 * id. GoTrue refuses password sign-in for an unconfirmed account whatever the
 * password is, so the Team page surfaces it the way the Supabase dashboard
 * does. Confirmation lives in the auth schema, which RLS does not expose to
 * browser sessions, so this reads through the service-role admin client and
 * fails open to an empty map when it is unavailable.
 */
export async function getUnverifiedEmails(): Promise<Record<string, boolean>> {
  const actor = await requirePermission("users.manage");
  if (actor.preview || !process.env.SUPABASE_SECRET_KEY) return {};
  try {
    const admin = createAdminSupabase();
    const unverified: Record<string, boolean> = {};
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) return {};
      const users = data.users ?? [];
      for (const user of users) if (!user.email_confirmed_at) unverified[user.id] = true;
      if (users.length < 200) break;
    }
    return unverified;
  } catch {
    return {};
  }
}
export async function getRolePermissions(): Promise<
  Record<Role, Permission[]>
> {
  const actor = await requirePermission("roles.manage");
  if (actor.preview) return DEFAULT_PERMISSIONS;
  const { data, error } = await (await createServerSupabase())
    .from("role_permissions")
    .select("role,permission");
  if (error) throw new Error("Permissions could not be loaded.");
  const result: Record<Role, Permission[]> = {
    administrator: [],
    manager: [],
    stores: [],
    production: [],
    export_sales: [],
    finance: [],
  };
  for (const row of data ?? [])
    result[row.role as Role].push(row.permission as Permission);
  return result;
}
export async function getAuditEvents(): Promise<AuditEvent[]> {
  const actor = await requirePermission("audit.view");
  if (actor.preview) return [];
  const { data, error } = await (await createServerSupabase())
    .from("audit_events")
    .select("id,action,target,created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error("Audit events could not be loaded.");
  return data as AuditEvent[];
}
