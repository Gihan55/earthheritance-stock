import { WorkspaceShell } from "@/components/workspace-shell";
import { getCompany, requireActor } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requireActor();
  const company = await getCompany();
  return (
    <WorkspaceShell
      actor={actor}
      companyName={company?.name ?? "Earthheritance"}
    >
      {children}
    </WorkspaceShell>
  );
}
