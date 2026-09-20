import Link from "next/link";
import { ArrowUpRight, UserPlus, Users } from "lucide-react";
import { AppIcon, PageHeading } from "@/components/ui";
import { InviteForm, PendingInvitation } from "@/components/forms";
import { TeamDirectory } from "@/components/team-directory";
import { getInvitations, getStaff, requirePermission } from "@/lib/workspace";

export const metadata = { title: "Team members" };
export default async function TeamPage() {
  const actor = await requirePermission("users.manage");
  const [staff, invitations] = await Promise.all([
    getStaff(),
    getInvitations(),
  ]);
  const active = staff.filter((member) => member.is_active).length;
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE & ACCESS"
        title="A team that grows together"
        description="Invite your colleagues and give everyone a clear place in the workflow."
      >
        <Link href="/roles" className="button button-secondary">
          <AppIcon name="roles" size={16} />
          Manage roles <ArrowUpRight size={15} />
        </Link>
      </PageHeading>
      <div className="summary-grid">
        <div className="summary-card">
          <span className="section-icon">
            <Users size={21} />
          </span>
          <div>
            <strong>{staff.length}</strong>
            <span>Team members</span>
          </div>
        </div>
        <div className="summary-card">
          <span className="section-icon">
            <AppIcon name="roles" size={21} />
          </span>
          <div>
            <strong>{active}</strong>
            <span>Active accounts</span>
          </div>
        </div>
        <div className="summary-card">
          <span className="section-icon">
            <AppIcon name="company" size={21} />
          </span>
          <div>
            <strong>6</strong>
            <span>Access levels</span>
          </div>
        </div>
      </div>
      <div className="team-layout">
        <div>
          <TeamDirectory staff={staff} preview={actor.preview} />
          {invitations.length > 0 && (
            <section className="panel panel-body pending-panel">
              <h2>Pending invitation requests</h2>
              <p className="muted">
                These requests have not created an account yet. Cancel unused
                requests or retry from the invitation form. Requests expire
                after 24 hours.
              </p>
              {invitations.map((invitation) => (
                <PendingInvitation
                  key={invitation.email}
                  invitation={invitation}
                />
              ))}
            </section>
          )}
        </div>
        <section className="panel invite-panel">
          <div className="invite-heading">
            <span className="section-icon">
              <UserPlus size={23} />
            </span>
            <h2>Make room for someone new</h2>
            <p>Send a secure invitation to your workspace.</p>
          </div>
          <InviteForm
            preview={actor.preview}
            invitationsEnabled={Boolean(
              process.env.SUPABASE_SECRET_KEY &&
                process.env.NEXT_PUBLIC_SITE_URL,
            )}
          />
        </section>
      </div>
    </>
  );
}
