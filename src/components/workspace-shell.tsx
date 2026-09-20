"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Actor } from "@/lib/workspace";
import { MODULES, moduleHref } from "@/lib/modules";
import { can, initials, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { signOut } from "@/app/actions";
import { AppIcon, Brand } from "./ui";
import { LiveRefresh } from "./live-refresh";

const adminLinks: {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
}[] = [
  {
    href: "/team",
    label: "Team members",
    icon: "team",
    permission: "users.manage",
  },
  {
    href: "/roles",
    label: "Roles & permissions",
    icon: "roles",
    permission: "roles.manage",
  },
  {
    href: "/settings",
    label: "Company settings",
    icon: "settings",
    permission: "settings.manage",
  },
];
export function WorkspaceShell({
  actor,
  companyName,
  children,
}: {
  actor: Actor;
  companyName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshing, startRefresh] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const modules = MODULES.filter((module) =>
    can(actor.permissions, module.permission),
  );
  const administration = adminLinks.filter((item) =>
    can(actor.permissions, item.permission),
  );
  const links = [
    { href: "/", label: "Overview", icon: "overview" },
    ...modules.map((module) => ({
      href: moduleHref(module.slug),
      label: module.label,
      icon: module.icon,
    })),
    ...administration,
    { href: "/setup", label: "Setup & guidance", icon: "help" },
  ];
  const current =
    links.find((link) => link.href === pathname)?.label ??
    (pathname === "/account/password" ? "Account security" : "Workspace");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        dialog.current?.showModal();
      }
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  function navLink(item: { href: string; label: string; icon: string }) {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`nav-link ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => setMobileOpen(false)}
      >
        <AppIcon name={item.icon} />
        <span>{item.label}</span>
        {active && <span className="nav-active-dot" />}
      </Link>
    );
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <Link href="/" aria-label="Earthheritance overview">
            <Brand />
          </Link>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">{initials(companyName)}</span>
          <span>
            <strong>{companyName}</strong>
            <small>Export management</small>
          </span>
          <ShieldCheck size={16} />
        </div>
        <nav className="sidebar-nav">
          <div className="nav-group">
            <span className="nav-caption">WORKSPACE</span>
            {navLink(links[0])}
          </div>
          {["Partners", "Operations", "Finance", "Insights"].map((group) => {
            const items = modules.filter((module) => module.group === group);
            return (
              items.length > 0 && (
                <div className="nav-group" key={group}>
                  <span className="nav-caption">{group.toUpperCase()}</span>
                  {items.map((module) =>
                    navLink({
                      href: moduleHref(module.slug),
                      label: module.label,
                      icon: module.icon,
                    }),
                  )}
                </div>
              )
            );
          })}
          {administration.length > 0 && (
            <div className="nav-group">
              <span className="nav-caption">ADMINISTRATION</span>
              {administration.map(navLink)}
            </div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/setup"
            className="support-link"
            onClick={() => setMobileOpen(false)}
          >
            <CircleHelp size={18} />
            <span>Setup & guidance</span>
            <ArrowUpRight size={15} />
          </Link>
          <div className="sidebar-footnote">
            <span className="status-dot" />
            {actor.preview
              ? "Local preview · Phase 5"
              : "Connected workspace · Phase 5"}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={14} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => {
                setQuery("");
                dialog.current?.showModal();
              }}
            >
              <Search size={17} />
              <span>Find a page...</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              <RefreshCw size={18} className={refreshing ? "spin" : ""} />
            </button>
            <div className="topbar-divider" />
            <details className="account-menu">
              <summary aria-label="Account menu">
                <span className="avatar">
                  {actor.preview ? "EH" : initials(actor.profile.full_name)}
                </span>
                <span className="account-label">
                  <strong>
                    {actor.preview
                      ? "Preview workspace"
                      : actor.profile.full_name}
                  </strong>
                  <small>{ROLE_LABELS[actor.profile.role]}</small>
                </span>
                <ChevronDown size={14} />
              </summary>
              <div className="account-dropdown">
                <p>{actor.profile.email}</p>
                {!actor.preview && (
                  <Link href="/account/password">Change password</Link>
                )}
                {actor.preview ? (
                  <Link href="/login">View sign-in screen</Link>
                ) : (
                  <form action={signOut}>
                    <button type="submit">
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </form>
                )}
              </div>
            </details>
          </div>
        </header>
        {actor.preview && (
          <div className="preview-banner">
            <span>
              <span className="status-dot amber" />
              <strong>Read-only preview</strong>
              <span className="preview-detail">
                Connect Supabase to save company settings and invite your team.
              </span>
            </span>
            <Link href="/setup">
              Setup guide <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>
            Earthheritance <span className="footer-dot">·</span> Cocopeat export
            management
          </span>
          <span>Built for a growing business.</span>
        </footer>
      </div>
      {!actor.preview && <LiveRefresh userId={actor.profile.id} />}
      <dialog
        ref={dialog}
        className="search-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="search-dialog-heading">
          <Search size={20} />
          <label className="sr-only" htmlFor="page-search">
            Find a page
          </label>
          <input
            id="page-search"
            autoFocus
            placeholder="Where would you like to go?"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={() => dialog.current?.close()}
          >
            <X size={19} />
          </button>
        </div>
        <div className="search-results">
          {links
            .filter((link) =>
              link.label.toLowerCase().includes(query.toLowerCase()),
            )
            .map((link) => (
              <Link
                href={link.href}
                key={link.href}
                onClick={() => dialog.current?.close()}
              >
                <AppIcon name={link.icon} />
                <span>{link.label}</span>
                <ChevronRight size={16} />
              </Link>
            ))}
          {!links.some((link) =>
            link.label.toLowerCase().includes(query.toLowerCase()),
          ) && <p className="muted">No pages match “{query}”.</p>}
        </div>
        <div className="search-hint">
          Page navigation only · Business record search comes with each module.
        </div>
      </dialog>
    </div>
  );
}
