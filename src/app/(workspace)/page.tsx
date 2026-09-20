import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Leaf,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { AppIcon, Badge, PageHeading } from "@/components/ui";
import {
  getAuditEvents,
  getCompany,
  getStaff,
  requireActor,
} from "@/lib/workspace";
import {
  getExportTotals,
  getPayablesTotals,
  getProductionTotals,
  getReceivablesTotals,
  getStockTotals,
} from "@/lib/records";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { MODULES, moduleHref } from "@/lib/modules";

export default async function OverviewPage() {
  const actor = await requireActor();
  const company = await getCompany();
  const staff = can(actor.permissions, "users.manage") ? await getStaff() : [];
  const activity = can(actor.permissions, "audit.view")
    ? await getAuditEvents()
    : [];
  const modules = MODULES.filter((module) =>
    can(actor.permissions, module.permission),
  );
  const stock = can(actor.permissions, "inventory.view")
    ? await getStockTotals()
    : null;
  const production = can(actor.permissions, "production.view")
    ? await getProductionTotals()
    : null;
  const exportsTotals = can(actor.permissions, "exports.view")
    ? await getExportTotals()
    : null;
  const payables = can(actor.permissions, "finance.view")
    ? await getPayablesTotals()
    : null;
  const receivables = can(actor.permissions, "finance.view")
    ? await getReceivablesTotals()
    : null;
  const setup = [
    {
      label: "Connect your workspace",
      description: "Secure cloud database and sign-in",
      done: !actor.preview,
      href: "/setup",
    },
    ...(can(actor.permissions, "settings.manage")
      ? [
          {
            label: "Make it your company",
            description: "Company, currency, and warehouse",
            done: !!company,
            href: "/settings",
          },
        ]
      : []),
    ...(can(actor.permissions, "users.manage")
      ? [
          {
            label: "Bring your team together",
            description: "Invite people and assign access",
            done: staff.length > 1,
            href: "/team",
          },
        ]
      : []),
  ];
  const complete = setup.filter((step) => step.done).length;
  const metrics = [
    {
      label: "Raw-material stock",
      icon: "inventory",
      hint: stock
        ? `${stock.rawItemCount} item type${stock.rawItemCount === 1 ? "" : "s"}${stock.lowCount ? ` · ${stock.lowCount} to reorder` : ""}`
        : "Stock tracking · Phase 2",
      value: stock ? String(stock.rawItemCount) : null,
      permission: "inventory.view" as const,
    },
    {
      label: "Production batches",
      icon: "production",
      hint: production
        ? `${production.postedCount} posted of ${production.total}${production.draftCount ? ` · ${production.draftCount} in draft` : ""}`
        : "Batch recording · Phase 3",
      value: production ? String(production.total) : null,
      permission: "production.view" as const,
    },
    {
      label: "Active export orders",
      icon: "exports",
      hint: exportsTotals
        ? `${exportsTotals.total} order${exportsTotals.total === 1 ? "" : "s"} recorded`
        : "Export operations · Phase 4",
      value: exportsTotals ? String(exportsTotals.activeCount) : null,
      permission: "exports.view" as const,
    },
    {
      label: "Supplier payables",
      icon: "outgoing",
      hint: payables
        ? `${payables.openCount} bill${payables.openCount === 1 ? "" : "s"} not fully paid`
        : "Payments made · Phase 4",
      value: payables ? String(payables.openCount) : null,
      permission: "finance.view" as const,
    },
    {
      label: "Buyer receivables",
      icon: "incoming",
      hint: receivables
        ? `${receivables.openCount} invoice${receivables.openCount === 1 ? "" : "s"} not fully paid`
        : "Payments received · Phase 4",
      value: receivables ? String(receivables.openCount) : null,
      permission: "finance.view" as const,
    },
  ].filter((metric) => can(actor.permissions, metric.permission));
  return (
    <>
      <PageHeading
        eyebrow="YOUR BUSINESS AT A GLANCE"
        title="Workspace overview"
        description="From raw materials to global markets. Everything starts here."
      >
        <Badge tone="green">
          <span className="status-dot" />
          Phase 5 · Reporting & Insights
        </Badge>
      </PageHeading>
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="welcome-eyebrow">
            <Sprout size={15} />
            ROOTED IN NATURE. READY FOR GROWTH.
          </span>
          <h2>
            A little more clarity.
            <br />A lot more possibility.
          </h2>
          <p>
            Your connected workspace for people, products, and
            <br className="desktop-break" /> the journey from cocopeat to the
            world.
          </p>
          <Link
            className="button button-light"
            href={
              can(actor.permissions, "settings.manage") ? "/settings" : "/setup"
            }
          >
            {company ? "View workspace settings" : "Set up your workspace"}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="botanical-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-orbit orbit-three" />
          <div className="art-stem" />
          <span className="art-leaf leaf-one" />
          <span className="art-leaf leaf-two" />
          <span className="art-leaf leaf-three" />
          <span className="art-leaf leaf-four" />
          <div className="art-label">
            <span className="art-label-icon">
              <Leaf size={20} />
            </span>
            <span>
              Grown with purpose.
              <br />
              <strong>Connected to the world.</strong>
            </span>
          </div>
          <span className="art-spark spark-one">+</span>
          <span className="art-spark spark-two">+</span>
        </div>
      </section>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <section className="metric-card" key={metric.label}>
            <div className="metric-label">
              <span>{metric.label}</span>
              <span className={`metric-icon ${metric.icon}`}>
                <AppIcon name={metric.icon} size={19} />
              </span>
            </div>
            <div className="metric-value">
              {metric.value ?? (
                <>
                  — <span>Not available yet</span>
                </>
              )}
            </div>
            <div className="metric-hint">
              <span className="tiny-dot" />
              {metric.hint}
            </div>
          </section>
        ))}
      </div>
      <div className="overview-columns">
        <div className="overview-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>One connected operation</h2>
                <p>
                  Your workflow, from the first purchase to the final payment.
                </p>
              </div>
              <Badge>Roadmap</Badge>
            </div>
            <div className="module-grid">
              {modules.slice(0, 6).map((module) => (
                <Link
                  href={moduleHref(module.slug)}
                  className="module-card"
                  key={module.slug}
                >
                  <span className={`module-icon ${module.icon}`}>
                    <AppIcon name={module.icon} size={21} />
                  </span>
                  <div>
                    <h3>{module.label}</h3>
                    <p>
                      {module.slug === "suppliers"
                        ? "Raw-material partners & purchase history"
                        : module.slug === "buyers"
                          ? "Buyer profiles & export relationships"
                          : module.slug === "inventory"
                            ? "Raw materials & finished products"
                            : module.slug === "production"
                              ? "Batches, consumption & wastage"
                              : module.slug === "exports"
                                ? "Orders, containers & shipping documents"
                                : "Bills, payments & outstanding balances"}
                    </p>
                    <span className="module-phase">
                      {module.live
                        ? `Available now · Phase ${module.phase}`
                        : `Planned · Phase ${module.phase}`}
                    </span>
                  </div>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
            {modules.length === 0 && (
              <p className="panel-body muted">
                No business modules are assigned to your role. Contact your
                administrator.
              </p>
            )}
          </section>
          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {can(actor.permissions, "audit.view")
                    ? "Recent workspace activity"
                    : "Your access level"}
                </h2>
                <p>
                  {can(actor.permissions, "audit.view")
                    ? "An accountable record of important changes."
                    : "Access is based on your responsibilities."}
                </p>
              </div>
              <ShieldCheck size={19} className="muted" />
            </div>
            {can(actor.permissions, "audit.view") ? (
              activity.length ? (
                <div className="activity-list">
                  {activity.slice(0, 4).map((event) => (
                    <div className="activity-row" key={event.id}>
                      <span className="activity-dot" />
                      <div>
                        <strong>
                          {event.action
                            .replaceAll(".", " · ")
                            .replaceAll("_", " ")}
                        </strong>
                        <small>
                          {new Date(event.created_at).toLocaleString("en-US", {
                            timeZone: "UTC",
                          })}{" "}
                          UTC
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="activity-empty">
                  <span className="activity-empty-icon">
                    <ShieldCheck size={22} />
                  </span>
                  <div>
                    <strong>A fresh start for your workspace</strong>
                    <p>
                      Company updates, invitations, and access changes will
                      appear here.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="panel-body">
                <Badge tone="green">{ROLE_LABELS[actor.profile.role]}</Badge>
                <p className="muted">
                  Your administrator can update your role as your
                  responsibilities change.
                </p>
              </div>
            )}
          </section>
        </div>
        <aside className="overview-side">
          <section className="panel setup-card">
            <div className="setup-card-head">
              <span className="section-icon">
                <Sprout size={23} />
              </span>
              <Badge tone="amber">Getting started</Badge>
            </div>
            <h2>
              Good things start
              <br />
              with a strong foundation.
            </h2>
            <p>Make this workspace yours in a few simple steps.</p>
            <div className="setup-progress-label">
              <span>Workspace setup</span>
              <strong>
                {complete} of {setup.length}
              </strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Workspace setup"
              aria-valuemin={0}
              aria-valuemax={setup.length}
              aria-valuenow={complete}
            >
              <span style={{ width: `${(complete / setup.length) * 100}%` }} />
            </div>
            <div className="setup-checklist">
              {setup.map((step, index) => (
                <Link href={step.href} key={step.label}>
                  <span className={`step-number ${step.done ? "done" : ""}`}>
                    {step.done ? <Check size={14} /> : index + 1}
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                  </span>
                  <ChevronRight size={15} />
                </Link>
              ))}
            </div>
          </section>
          <section className="access-card">
            <ShieldCheck size={23} />
            <h3>
              The right access.
              <br />
              For the right people.
            </h3>
            <p>
              Six staff levels keep operational and financial information in the
              right hands.
            </p>
            {can(actor.permissions, "roles.manage") ? (
              <Link href="/roles">
                Explore access levels <ArrowRight size={15} />
              </Link>
            ) : (
              <span className="text-link">
                {ROLE_LABELS[actor.profile.role]}
              </span>
            )}
          </section>
        </aside>
      </div>
      <div className="phase-note">
        <span className="status-dot" />
        <span>
          <strong>Built step by step, with your guidance.</strong> Business
          modules will be developed after foundation approval. No sample
          transactions are shown.
        </span>
      </div>
    </>
  );
}
