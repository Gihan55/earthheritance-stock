import { Badge, PageHeading } from "@/components/ui";
import { RoleEditor } from "@/components/role-editor";
import { getRolePermissions, requirePermission } from "@/lib/workspace";

export const metadata = { title: "Roles & permissions" };
export default async function RolesPage() {
  const actor = await requirePermission("roles.manage");
  const permissions = await getRolePermissions();
  return (
    <>
      <PageHeading
        eyebrow="A PLACE FOR EVERY RESPONSIBILITY"
        title="Roles & permissions"
        description="Keep your team connected, with clear boundaries around access."
      >
        <Badge tone="green">6 access levels</Badge>
      </PageHeading>
      <RoleEditor permissions={permissions} preview={actor.preview} />
      <p className="phase-note">
        Permissions for stock, production, exports, and finance are configured
        here now. Their business modules will arrive in the following phases.
      </p>
    </>
  );
}
