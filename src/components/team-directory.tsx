"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import type { StaffProfile } from "@/lib/workspace";
import { initials, ROLE_LABELS, ROLES } from "@/lib/permissions";
import { Badge, EmptyState } from "./ui";
import { StaffAccessForm, StaffPasswordResetForm } from "./forms";

export function TeamDirectory({
  staff,
  preview,
}: {
  staff: StaffProfile[];
  preview: boolean;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const filtered = staff.filter(
    (member) =>
      (role === "all" || member.role === role) &&
      `${member.full_name} ${member.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const adminCount = staff.filter(
    (member) => member.is_active && member.role === "administrator",
  ).length;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Your team <span className="count-bubble">{staff.length}</span>
          </h2>
          <p>Give the right people the right access.</p>
        </div>
        <Badge tone="green">Invitation only</Badge>
      </div>
      <div className="table-toolbar">
        <div className="input-icon">
          <Search size={17} />
          <label className="sr-only" htmlFor="team-search">
            Search staff
          </label>
          <input
            id="team-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email..."
          />
        </div>
        <label className="sr-only" htmlFor="role-filter">
          Filter by role
        </label>
        <select
          id="role-filter"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="all">All roles</option>
          {ROLES.map((item) => (
            <option value={item} key={item}>
              {ROLE_LABELS[item]}
            </option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon="team"
          title={
            staff.length ? "No matching team members" : "Your team starts here"
          }
          description={
            staff.length
              ? "Try a different name, email, or role."
              : preview
                ? "Connect Supabase and create your first administrator. You can then invite staff into their own access levels."
                : "Invite your colleagues to start working together."
          }
        />
      ) : (
        <div className="staff-list">
          {filtered.map((member) => (
            <div className="staff-row" key={member.id}>
              <div className="staff-identity">
                <span className="avatar">{initials(member.full_name)}</span>
                <div>
                  <strong>{member.full_name}</strong>
                  <small>{member.email}</small>
                </div>
                <Badge tone={member.is_active ? "green" : "neutral"}>
                  {member.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <StaffAccessForm
                key={`${member.id}-${member.role}-${member.is_active}`}
                profile={member}
                locked={
                  member.role === "administrator" &&
                  member.is_active &&
                  adminCount === 1
                }
              />
              {!preview && <StaffPasswordResetForm profile={member} preview={preview} />}
            </div>
          ))}
        </div>
      )}
      <div className="panel-footnote">
        Deactivating a staff member preserves their historical records. Use
        Reset password only when a colleague needs access restored right away;
        everyone can also change their own password from the account menu.
      </div>
    </section>
  );
}
