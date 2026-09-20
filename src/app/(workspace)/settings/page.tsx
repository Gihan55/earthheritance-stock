import Link from "next/link";
import { ArrowRight, Building2, Globe2, ShieldCheck } from "lucide-react";
import { Badge, PageHeading } from "@/components/ui";
import { CompanyForm } from "@/components/forms";
import { getCompany, requirePermission } from "@/lib/workspace";

export const metadata = { title: "Company settings" };
export default async function SettingsPage() {
  const actor = await requirePermission("settings.manage");
  const company = await getCompany();
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Company settings"
        description="The foundation of your business, all in one place."
      >
        <Badge tone={company ? "green" : "amber"}>
          {company ? "Company configured" : "Setup required"}
        </Badge>
      </PageHeading>
      <div className="settings-layout">
        <section className="panel">
          <div className="panel-heading">
            <div className="heading-with-icon">
              <span className="section-icon">
                <Building2 size={23} />
              </span>
              <div>
                <h2>Your business identity</h2>
                <p>Only administrators can change these details.</p>
              </div>
            </div>
          </div>
          <CompanyForm company={company} preview={actor.preview} />
        </section>
        <aside className="settings-aside">
          <section className="info-card">
            <Globe2 size={26} />
            <h3>
              Local roots.
              <br />
              Global reach.
            </h3>
            <p>
              Choose your company’s base currency for reporting. Buyer invoices
              and supplier payments will also retain their original transaction
              currencies.
            </p>
            <div className="info-divider" />
            <h4>One warehouse to begin</h4>
            <p>
              Name your main factory or storage location. Additional locations
              can be added in a later phase.
            </p>
          </section>
          <section className="panel panel-body">
            <ShieldCheck size={22} className="green-text" />
            <h3>Changes stay accountable</h3>
            <p className="muted">
              Every saved company update is recorded in the administrative audit
              history.
            </p>
            <Link href="/" className="text-link">
              View workspace activity <ArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
