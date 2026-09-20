"use client";
import { useActionState, useState } from "react";
import { Check, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import {
  ADMIN_PERMISSIONS,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type Permission,
  type Role,
} from "@/lib/permissions";
import { saveRolePermissions } from "@/app/actions";
import { INITIAL_STATE } from "@/lib/validation";
import { Feedback, PreviewNote, SubmitButton } from "./forms";
import { Badge } from "./ui";

function PermissionForm({
  role,
  selected,
  preview,
}: {
  role: Role;
  selected: Permission[];
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveRolePermissions,
    INITIAL_STATE,
  );
  const isAdmin = role === "administrator";
  return (
    <form action={action}>
      <input type="hidden" name="role" value={role} />
      <div className="permission-heading">
        <span className="section-icon">
          <ShieldCheck size={24} />
        </span>
        <div>
          <h2>{ROLE_LABELS[role]}</h2>
          <p>{ROLE_DESCRIPTIONS[role]}</p>
        </div>
        <Badge tone={isAdmin ? "green" : "neutral"}>
          {isAdmin ? "Full access" : "Customizable"}
        </Badge>
      </div>
      <div className="permission-list">
        {(Object.entries(PERMISSIONS) as [Permission, string][]).map(
          ([permission, label]) => {
            const protectedPermission = ADMIN_PERMISSIONS.includes(permission);
            return (
              <label className="permission-row" key={permission}>
                <span>
                  <strong>{label}</strong>
                  <small>{permission}</small>
                </span>
                {protectedPermission && (
                  <span className="permission-lock">
                    <LockKeyhole size={13} />
                    Admin only
                  </span>
                )}
                <input
                  type="checkbox"
                  name="permissions"
                  value={permission}
                  defaultChecked={selected.includes(permission)}
                  disabled={isAdmin || protectedPermission || pending}
                />
              </label>
            );
          },
        )}
      </div>
      <div className="permission-footer">
        {isAdmin ? (
          <p className="form-note">
            <LockKeyhole size={17} />
            Administrator permissions cannot be removed. At least one active
            administrator must remain.
          </p>
        ) : (
          <>
            <Feedback state={state} />
            {preview && <PreviewNote />}
            <div className="form-actions">
              <span>Changes affect everyone assigned this role.</span>
              <SubmitButton pending={pending} disabled={preview}>
                <Save size={17} />
                Save permissions
              </SubmitButton>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
export function RoleEditor({
  permissions,
  preview,
}: {
  permissions: Record<Role, Permission[]>;
  preview: boolean;
}) {
  const [role, setRole] = useState<Role>("administrator");
  return (
    <div className="roles-layout">
      <div className="role-selector" aria-label="Select an access level">
        {ROLES.map((item, index) => (
          <button
            type="button"
            key={item}
            className={`role-option ${role === item ? "selected" : ""}`}
            onClick={() => setRole(item)}
            aria-pressed={role === item}
          >
            <span className="role-number">0{index + 1}</span>
            <span>
              <strong>{ROLE_LABELS[item]}</strong>
              <small>{permissions[item].length} permissions</small>
            </span>
            {role === item && <Check size={17} />}
          </button>
        ))}
        <p className="role-help">
          Operational and financial access are separate. Staff only see the
          modules their role permits.
        </p>
      </div>
      <section className="panel">
        <PermissionForm
          key={`${role}-${permissions[role].join(",")}`}
          role={role}
          selected={permissions[role]}
          preview={preview}
        />
      </section>
    </div>
  );
}
