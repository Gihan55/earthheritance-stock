import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Layers3 } from "lucide-react";
import { AppIcon, Badge, PageHeading } from "@/components/ui";
import { MODULES } from "@/lib/modules";
import { requirePermission } from "@/lib/workspace";

export default async function PlannedModulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const businessModule = MODULES.find((item) => item.slug === slug);
  if (!businessModule) notFound();
  await requirePermission(businessModule.permission);
  return (
    <>
      <PageHeading
        eyebrow={businessModule.group.toUpperCase()}
        title={businessModule.label}
        description={businessModule.description}
      >
        <Badge tone="amber">Planned · Phase {businessModule.phase}</Badge>
      </PageHeading>
      <section className="planned-module panel">
        <div className="planned-illustration">
          <span className="planned-orbit" />
          <span className="planned-icon">
            <AppIcon name={businessModule.icon} size={54} strokeWidth={1.3} />
          </span>
          <span className="planned-small-icon">
            <Layers3 size={20} />
          </span>
        </div>
        <span className="eyebrow">THE NEXT CHAPTER</span>
        <h2>Built around the way you work.</h2>
        <p>
          This module is part of the approved roadmap. We’re completing the
          foundation first and will build this workflow with your guidance.
        </p>
        <div className="planned-features">
          {businessModule.features.map((feature) => (
            <div key={feature}>
              <span>
                <Check size={16} />
              </span>
              {feature}
            </div>
          ))}
        </div>
        <div className="notice">
          No business transactions can be entered here yet.
        </div>
        <Link href="/" className="button button-secondary">
          <ArrowLeft size={16} />
          Back to overview
        </Link>
      </section>
    </>
  );
}
