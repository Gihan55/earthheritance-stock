import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { requireActor } from "@/lib/workspace";

export default async function AccessDeniedPage() {
  await requireActor();
  return (
    <section className="panel">
      <EmptyState
        icon="roles"
        title="This page is outside your access level"
        description="Your account does not have permission to view this area. Contact your administrator if your responsibilities have changed."
      >
        <Link href="/" className="button button-primary">
          Back to overview
        </Link>
      </EmptyState>
    </section>
  );
}
