import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  CircleHelp,
  Factory,
  Globe2,
  LayoutDashboard,
  Leaf,
  Settings,
  ShieldCheck,
  Ship,
  Truck,
  Users,
  type LucideProps,
} from "lucide-react";
import type { ReactNode } from "react";

const icons = {
  overview: LayoutDashboard,
  suppliers: Truck,
  buyers: Globe2,
  inventory: Boxes,
  production: Factory,
  exports: Ship,
  outgoing: ArrowUpRight,
  incoming: ArrowDownLeft,
  reports: BarChart3,
  team: Users,
  roles: ShieldCheck,
  settings: Settings,
  company: Building2,
  help: CircleHelp,
  leaf: Leaf,
};
export function AppIcon({ name, ...props }: LucideProps & { name: string }) {
  const Icon = icons[name as keyof typeof icons] ?? Boxes;
  return <Icon size={19} strokeWidth={1.7} aria-hidden="true" {...props} />;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Leaf size={23} strokeWidth={1.8} />
      </span>
      {!compact && (
        <span>
          earthheritance
          <span className="brand-caption">GROW. CREATE. CONNECT.</span>
        </span>
      )}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <AppIcon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
