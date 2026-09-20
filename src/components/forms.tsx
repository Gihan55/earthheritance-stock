"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  Mail,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  changePassword,
  inviteStaff,
  saveCompany,
  signIn,
  updateStaffAccess,
  cancelInvitation,
} from "@/app/actions";
import { INITIAL_STATE, type ActionState } from "@/lib/validation";
import { ROLE_LABELS, ROLES } from "@/lib/permissions";
import type { Company, Invitation, StaffProfile } from "@/lib/workspace";

export function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <div
      className={`form-feedback ${state.success ? "success" : "error"}`}
      role={state.success ? "status" : "alert"}
    >
      {state.success ? <Check size={17} /> : <Info size={17} />}
      <span>{state.message}</span>
    </div>
  );
}
export function PreviewNote() {
  return (
    <p className="form-note">
      <Info size={16} />
      You can explore this form. Saving requires a connected Supabase project.
    </p>
  );
}
export function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className="button button-primary"
      disabled={pending || disabled}
    >
      {pending ? <LoaderCircle size={17} className="spin" /> : null}
      {pending ? "Please wait..." : children}
    </button>
  );
}
export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(signIn, INITIAL_STATE);
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="stack-form">
      <label>
        Email address
        <div className="input-icon">
          <Mail size={17} />
          <input
            type="email"
            name="email"
            placeholder="you@company.com"
            autoComplete="email"
            required
            maxLength={254}
          />
        </div>
      </label>
      <label>
        Password
        <div className="password-input">
          <input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
          />
          <button
            type="button"
            className="icon-button"
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>
      <Feedback state={state} />
      <SubmitButton pending={pending} disabled={!configured}>
        Sign in to workspace <ArrowRight size={17} />
      </SubmitButton>
      <p className="auth-help">
        Access is by invitation only. Contact your administrator if you need an
        account or password reset.
      </p>
    </form>
  );
}
export function PasswordForm({ preview }: { preview: boolean }) {
  const [state, action, pending] = useActionState(
    changePassword,
    INITIAL_STATE,
  );
  return (
    <form action={action} className="stack-form">
      <label>
        New password
        <input
          type="password"
          name="password"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
        <small>
          Use at least 12 characters. A unique passphrase is recommended.
        </small>
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          name="confirmPassword"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
      </label>
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <SubmitButton pending={pending} disabled={preview}>
        <ShieldCheck size={17} />
        Save password
      </SubmitButton>
      {state.success && (
        <Link className="text-link" href="/">
          Open your workspace <ArrowRight size={16} />
        </Link>
      )}
    </form>
  );
}
export function CompanyForm({
  company,
  preview,
}: {
  company: Company | null;
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(saveCompany, INITIAL_STATE);
  return (
    <form action={action} className="company-form">
      <div className="form-section-title">
        <h3>Company information</h3>
        <p>These details identify your business throughout the workspace.</p>
      </div>
      <div className="form-grid">
        <label className="full-width">
          Company name <span className="required">*</span>
          <input
            name="name"
            defaultValue={company?.name}
            required
            minLength={2}
            maxLength={160}
            placeholder="Your company name"
            autoComplete="organization"
          />
        </label>
        <label>
          Company email
          <input
            type="email"
            name="email"
            defaultValue={company?.email}
            maxLength={254}
            placeholder="office@company.com"
            autoComplete="email"
          />
        </label>
        <label>
          Phone number
          <input
            name="phone"
            defaultValue={company?.phone}
            maxLength={40}
            placeholder="Include country code"
            autoComplete="tel"
          />
        </label>
        <label className="full-width">
          Business address
          <textarea
            name="address"
            defaultValue={company?.address}
            maxLength={500}
            rows={3}
            placeholder="Street address, city, and postal code"
            autoComplete="street-address"
          />
        </label>
        <label>
          Country <span className="required">*</span>
          <input
            name="country"
            defaultValue={company?.country}
            required
            minLength={2}
            maxLength={80}
            placeholder="Company’s country"
            autoComplete="country-name"
          />
        </label>
        <label>
          Base currency <span className="required">*</span>
          <input
            name="base_currency"
            defaultValue={company?.base_currency}
            list="currency-list"
            required
            minLength={3}
            maxLength={3}
            pattern="[A-Za-z]{3}"
            placeholder="Select or enter a code"
          />
          <datalist id="currency-list">
            {[
              "USD",
              "LKR",
              "INR",
              "EUR",
              "GBP",
              "AED",
              "AUD",
              "CAD",
              "SGD",
            ].map((currency) => (
              <option key={currency} value={currency} />
            ))}
          </datalist>
          <small>
            Three-letter currency code. Foreign-currency transactions will
            retain their original amounts.
          </small>
        </label>
      </div>
      <div className="form-section-title divided">
        <h3>Warehouse</h3>
        <p>Version one supports one stock location.</p>
      </div>
      <label>
        Warehouse name <span className="required">*</span>
        <input
          name="warehouse_name"
          defaultValue={company?.warehouse_name}
          required
          minLength={2}
          maxLength={100}
          placeholder="e.g. Main factory warehouse"
        />
      </label>
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <div className="form-actions">
        <span>* Required fields</span>
        <SubmitButton pending={pending} disabled={preview}>
          <Save size={17} />
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}
export function InviteForm({
  preview,
  invitationsEnabled,
}: {
  preview: boolean;
  invitationsEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(inviteStaff, INITIAL_STATE);
  return (
    <form id="invite" action={action} className="stack-form">
      <label>
        Full name
        <input
          name="full_name"
          required
          minLength={2}
          maxLength={100}
          placeholder="Staff member’s name"
          autoComplete="off"
        />
      </label>
      <label>
        Email address
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          placeholder="name@company.com"
          autoComplete="off"
        />
      </label>
      <label>
        Access level
        <select name="role" defaultValue="stores">
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
      <p className="form-note">
        <ShieldCheck size={16} />
        An email invitation lets them securely set their own password.
      </p>
      <Feedback state={state} />
      {preview ? (
        <PreviewNote />
      ) : (
        !invitationsEnabled && (
          <p className="form-feedback error">
            Configure the server secret key and site URL to enable invitations.
          </p>
        )
      )}
      <SubmitButton pending={pending} disabled={preview || !invitationsEnabled}>
        <Send size={16} />
        Send invitation
      </SubmitButton>
    </form>
  );
}
export function StaffAccessForm({
  profile,
  locked,
}: {
  profile: StaffProfile;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateStaffAccess,
    INITIAL_STATE,
  );
  return (
    <form action={action} className="staff-access-form">
      <input type="hidden" name="user_id" value={profile.id} />
      <div className="staff-access-controls">
        <label className="sr-only" htmlFor={`role-${profile.id}`}>
          Role for {profile.full_name}
        </label>
        <select
          id={`role-${profile.id}`}
          name="role"
          defaultValue={profile.role}
          disabled={locked || pending}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`status-${profile.id}`}>
          Access for {profile.full_name}
        </label>
        <select
          id={`status-${profile.id}`}
          name="is_active"
          defaultValue={String(profile.is_active)}
          disabled={locked || pending}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button
          type="submit"
          className="button button-secondary button-small"
          disabled={locked || pending}
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
      {locked && (
        <small>Last active administrator — access is protected.</small>
      )}
      <Feedback state={state} />
    </form>
  );
}
export function PendingInvitation({ invitation }: { invitation: Invitation }) {
  const [state, action, pending] = useActionState(
    cancelInvitation,
    INITIAL_STATE,
  );
  return (
    <form action={action} className="pending-invite">
      <input type="hidden" name="email" value={invitation.email} />
      <div>
        <strong>{invitation.full_name}</strong>
        <small>
          {invitation.email} · {ROLE_LABELS[invitation.role]}
        </small>
      </div>
      <button
        type="submit"
        className="button button-secondary button-small"
        disabled={pending}
      >
        Cancel pending request
      </button>
      <Feedback state={state} />
    </form>
  );
}
