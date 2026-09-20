import { PageHeading } from "@/components/ui";
import { PasswordForm } from "@/components/forms";
import { requireActor } from "@/lib/workspace";

export const metadata = { title: "Account security" };
export default async function PasswordPage() {
  const actor = await requireActor();
  return (
    <>
      <PageHeading
        eyebrow="ACCOUNT SECURITY"
        title="Your password, your access"
        description="Set a strong password for your personal workspace account."
      />
      <section className="panel panel-body narrow-panel">
        <PasswordForm preview={actor.preview} />
      </section>
    </>
  );
}
