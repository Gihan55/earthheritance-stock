import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  LockKeyhole,
  Server,
  UserPlus,
} from "lucide-react";
import { Badge, PageHeading } from "@/components/ui";
import { requireActor } from "@/lib/workspace";
import { can } from "@/lib/permissions";

export const metadata = { title: "Setup & guidance" };
export default async function SetupPage() {
  const actor = await requireActor();
  return (
    <>
      <PageHeading
        eyebrow="A STRONG START"
        title="Connect your workspace"
        description="A few one-time steps to move from local preview to a shared company workspace."
      >
        <Badge tone={actor.preview ? "amber" : "green"}>
          {actor.preview ? "Supabase not connected" : "Authenticated workspace"}
        </Badge>
      </PageHeading>
      <div className="setup-intro">
        <span className="section-icon">
          <LockKeyhole size={23} />
        </span>
        <div>
          <strong>Your data stays yours.</strong>
          <p>
            No cloud resources have been created, no invitations have been sent,
            and no live data has been imported by this setup screen. Configure
            your own Supabase project when ready.
          </p>
        </div>
      </div>
      {can(actor.permissions, "settings.manage") ? (
        <div className="setup-guide">
          <section className="panel guide-step">
            <span className="guide-number">01</span>
            <div>
              <h2>
                <Database size={20} />
                Prepare your Supabase project
              </h2>
              <p>
                Create a Supabase project, then run every migration in its SQL
                editor, in this exact order:
              </p>
              <pre
                className="code-block"
              >{`supabase/migrations/0001_foundation.sql
supabase/migrations/0002_suppliers_stock.sql
supabase/migrations/0003_production.sql
supabase/migrations/0004_exports_finance.sql
supabase/migrations/0005_reporting.sql
supabase/migrations/0006_performance.sql
supabase/migrations/0007_register_references.sql
supabase/migrations/0008_documents.sql
supabase/migrations/0009_staff_password_audit.sql`}</pre>
              <p>
                Together these create profiles, six access levels, permissions,
                company settings, invitation handling, audit records and
                row-level security; then the stock, production, export and
                finance tables, reporting views, performance indexes, the
                private attachments bucket for supporting documents, and the
                staff password-reset audit trail.
              </p>
            </div>
          </section>
          <section className="panel guide-step">
            <span className="guide-number">02</span>
            <div>
              <h2>
                <Server size={20} />
                Connect the application
              </h2>
              <p>
                Copy <code>.env.example</code> to <code>.env.local</code> and
                enter your project values. Restart the development server
                afterward.
              </p>
              <pre className="code-block">{`NEXT_PUBLIC_SUPABASE_URL=your-project-url\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key\nSUPABASE_SECRET_KEY=your-server-only-secret\nNEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000`}</pre>
              <p className="notice">
                Never share the secret key in chat or put it in browser code.
                Production requires an HTTPS site URL. Local preview is disabled
                in production.
              </p>
            </div>
          </section>
          <section className="panel guide-step">
            <span className="guide-number">03</span>
            <div>
              <h2>
                <LockKeyhole size={20} />
                Configure invitation-only authentication
              </h2>
              <ul>
                <li>Disable public user sign-ups in Supabase Auth.</li>
                <li>
                  Set the Auth Site URL to the same origin as{" "}
                  <code>NEXT_PUBLIC_SITE_URL</code>.
                </li>
                <li>
                  Allow that origin’s <code>/auth/callback</code> URL in Auth
                  redirect settings.
                </li>
                <li>
                  Configure SMTP before sending staff invitations; default email
                  delivery has restrictions.
                </li>
                <li>
                  Set a minimum password length of 12 and configure appropriate
                  Auth rate limits.
                </li>
              </ul>
              <p>
                The default Supabase invitation email works with the callback
                page. For a token-hash email template, use the supported
                confirmation route:
              </p>
              <code className="code-block">
                {
                  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite"
                }
              </code>
            </div>
          </section>
          <section className="panel guide-step">
            <span className="guide-number">04</span>
            <div>
              <h2>
                <UserPlus size={20} />
                Create the first administrator
              </h2>
              <p>
                Create one user with a secure password in Supabase Auth. Copy
                their user ID, then run this in the SQL editor with your actual
                values:
              </p>
              <code className="code-block">
                {
                  "select public.app_bootstrap_admin('AUTH_USER_UUID', 'Your full name');"
                }
              </code>
              <p>
                This one-time function is blocked for browser users and refuses
                to run after initialization. Then sign in, save your company
                settings, and invite staff from Team members.
              </p>
              <Link href="/login" className="button button-primary">
                Open sign-in <ArrowRight size={16} />
              </Link>
            </div>
          </section>
          <section className="panel guide-step">
            <span className="guide-number">
              <CheckCircle2 size={20} />
            </span>
            <div>
              <h2>Verify before using live data</h2>
              <p>
                Test invitations and password setup, sign in with each role,
                save company settings, deactivate a test account, and verify
                updates across two browsers. Confirm that a direct unauthorized
                request is denied. Production launch and backup/restore
                verification are separate later steps.
              </p>
            </div>
          </section>
        </div>
      ) : (
        <section className="panel panel-body">
          <h2>Your administrator manages setup</h2>
          <p>
            Contact your administrator for company settings, staff invitations,
            and role changes. Your workspace already uses your assigned
            permissions.
          </p>
          <Link href="/" className="text-link">
            Return to overview <ArrowRight size={16} />
          </Link>
        </section>
      )}
    </>
  );
}
