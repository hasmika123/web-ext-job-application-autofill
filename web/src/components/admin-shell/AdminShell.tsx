"use client";

import DemoSideTab from "@/components/demo/DemoSideTab";
import DemoBadge from "@/components/demo/DemoBadge";
import DemoReadOnlyToaster from "@/components/demo/DemoReadOnlyToaster";
import { isDemoLogin, DEMO_NOTE } from "@/lib/demo";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AiIcon,
  BarChartIcon,
  BellIcon,
  BoardIcon,
  BuildingIcon,
  BugIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CreditCardIcon,
  DashboardIcon,
  FileTextIcon,
  GearIcon,
  HelpCircleIcon,
  MailIcon,
  MenuIcon,
  MessageIcon,
  MonitorIcon,
  SearchIcon,
  ShieldIcon,
  SignOutIcon,
  UsersIcon,
  XIcon,
  cn,
} from "@kiwiply/ui";
import { notifyExtension } from "@/lib/extension-signal";
import BrandLogo from "@/components/marketing/BrandLogo";
import { MascotCard } from "@/components/app-v2/common";

export interface AdminAccount {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  authorities?: string[];
}

type NavItem = { href: string; label: string; icon: ReactNode; soon?: boolean };

// Shared stroke icons (@kiwiply/ui).
const ICON = "h-[18px] w-[18px] flex-none";
const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: <DashboardIcon className={ICON} /> },
  { href: "/admin/users", label: "Users", icon: <UsersIcon className={ICON} /> },
  { href: "/admin/customers", label: "Customers", icon: <CreditCardIcon className={ICON} /> },
  { href: "/admin/organizations", label: "Organizations", icon: <BuildingIcon className={ICON} /> },
  { href: "/admin/ai", label: "AI usage", icon: <AiIcon className={ICON} /> },
  { href: "/admin/ai/providers", label: "AI providers", icon: <GearIcon className={ICON} /> },
  { href: "/admin/job-sources", label: "Job sources", icon: <BoardIcon className={ICON} /> },
  { href: "/admin/security", label: "Security", icon: <ShieldIcon className={ICON} />, soon: true },
  { href: "/admin/analytics", label: "Analytics", icon: <BarChartIcon className={ICON} /> },
  { href: "/admin/subscribers", label: "Email", icon: <MailIcon className={ICON} /> },
  { href: "/admin/bug-reports", label: "Bug reports", icon: <BugIcon className={ICON} /> },
  { href: "/admin/inquiries", label: "Inquiries", icon: <MessageIcon className={ICON} /> },
  { href: "/admin/system", label: "System", icon: <MonitorIcon className={ICON} /> },
  { href: "/admin/audit", label: "Audit log", icon: <FileTextIcon className={ICON} /> },
];

function displayName(account?: AdminAccount | null): string {
  if (account?.firstName) return [account.firstName, account.lastName].filter(Boolean).join(" ");
  return account?.login || account?.email || "Admin";
}

function AdminBadge() {
  return (
    <span className="rounded-md bg-v2-lime px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-v2-navy">Admin</span>
  );
}

/** Avatar + name + "Administrator" + chevron; menu = Back to app, Sign out. Demo accounts get the badge + note. */
function AccountChip({ account, demo, onNavigate }: { account?: AdminAccount | null; demo: boolean; onNavigate: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const name = displayName(account);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      notifyExtension("signedOut"); // the extension drops its own session at once (11.1)
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-ink hover:bg-paper-2";
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-paper-2"
      >
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-v2-lime-soft text-[15px] font-extrabold text-v2-navy ring-2 ring-v2-lime/40">
          {(name.charAt(0) || "A").toUpperCase()}
        </span>
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-[150px] truncate text-[14px] font-bold text-ink">
            {name}
            {demo && <DemoBadge className="ml-1.5" />}
          </span>
          <span className="block text-[12px] text-v2-muted">Administrator</span>
        </span>
        <ChevronDownIcon size={16} className={cn("hidden text-ink-soft transition-transform sm:block", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-[130] mt-2 w-[250px] rounded-2xl border border-line bg-paper p-1.5 shadow-[var(--shadow-lg)]"
        >
          {demo && <p className="px-3 pb-1.5 pt-2 text-[12px] font-medium leading-snug text-v2-amber">{DEMO_NOTE}</p>}
          <Link
            role="menuitem"
            href="/dashboard"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className={item}
          >
            <ChevronLeftIcon size={17} className="text-ink-soft" />
            Back to app
          </Link>
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={signOut} disabled={busy} className={cn(item, "disabled:opacity-50")}>
            <SignOutIcon size={17} className="text-ink-soft" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Admin console shell (admin v3): white sidebar (logo + ADMIN pill, soft-blue active pill, help card),
 * 64px top bar (global search, bell, help, account chip). Below `lg` the sidebar is a drawer.
 * Security is a live link carrying a "Soon" pill. Role gating happens in `app/(admin)/layout.tsx`.
 */
export default function AdminShell({ account, children }: { account?: AdminAccount | null; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const demo = isDemoLogin(account?.login);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/admin/users?q=${encodeURIComponent(q)}` : "/admin/users");
  }

  return (
    <div className="flex flex-1 flex-col bg-v2-canvas lg:grid lg:grid-cols-[236px_1fr] lg:items-start">
      <aside
        aria-label="Admin"
        className={cn(
          "fixed inset-y-0 left-0 z-[120] flex w-[272px] flex-col gap-1 overflow-y-auto border-r border-line/70 bg-paper px-3.5 pb-4 pt-4",
          "transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-3 flex h-12 items-center justify-between px-1.5">
          <Link href="/admin" aria-label="Kiwiply admin" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <BrandLogo height={38} priority />
            <AdminBadge />
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-paper-2 lg:hidden"
          >
            <XIcon size={18} />
          </button>
        </div>

        <nav aria-label="Admin sections" className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            // Exact match for Overview ("/admin"); prefix match for the deeper sections.
            // A deeper sibling wins (/admin/ai/providers is "AI providers", not also "AI usage").
            const deeper = NAV.some((o) => o.href.startsWith(item.href + "/") && (pathname === o.href || pathname.startsWith(o.href + "/")));
            const active = !deeper && (pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/")));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-[9px] text-[14px] transition-colors",
                  active ? "bg-v2-nav-active-bg font-bold text-v2-nav-active-text" : "font-medium text-ink-soft hover:bg-paper-2 hover:text-ink",
                  item.soon && !active && "text-ink-soft/70",
                )}
              >
                <span className="flex-none">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {item.soon && (
                  <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft ring-1 ring-line/70">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-ink-soft hover:bg-paper-2"
          >
            <ChevronLeftIcon className="h-[16px] w-[16px] flex-none" />
            <span className="truncate">Back to app</span>
          </Link>
          <MascotCard
            tone="violet"
            mascot="mascot-help"
            mascotHeight={64}
            title="Need help?"
            body="Get support or speak to our team."
            cta={{ label: "Contact support", href: "/contact" }}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[110] bg-[rgba(15,19,64,.42)] lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 flex-none items-center gap-2 border-b border-line/60 bg-paper/90 px-3 backdrop-blur sm:gap-3 sm:px-5 lg:px-6">
          <button
            type="button"
            aria-label="Open admin menu"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 flex-none place-items-center rounded-full text-ink hover:bg-paper-2 lg:hidden"
          >
            <MenuIcon size={22} />
          </button>
          <Link href="/admin" aria-label="Kiwiply admin" className="flex flex-none items-center gap-1.5 sm:hidden">
            <BrandLogo height={28} />
            <AdminBadge />
          </Link>

          <form onSubmit={submitSearch} role="search" className="hidden min-w-0 max-w-[600px] flex-1 sm:block">
            <label className="relative block">
              <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users, customers, jobs, or anything..."
                aria-label="Search users, customers, jobs, or anything"
                className="h-11 w-full rounded-xl border border-transparent bg-v2-blue-soft/60 pl-11 pr-4 text-[14px] text-ink outline-none transition-colors placeholder:text-v2-muted focus:border-v2-blue/40 focus:bg-paper focus-visible:ring-2 focus-visible:ring-v2-blue/25 [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
          </form>

          <div className="ml-auto flex flex-none items-center gap-1 sm:gap-2">
            <Link
              href="/admin/audit"
              aria-label="Recent admin activity"
              title="Recent admin activity"
              className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-paper-2"
            >
              <BellIcon size={20} />
              <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-v2-coral ring-2 ring-paper" />
            </Link>
            <Link
              href="/contact"
              aria-label="Help and support"
              title="Help and support"
              className="hidden h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-paper-2 sm:grid"
            >
              <HelpCircleIcon size={20} />
            </Link>
            {demo && <DemoReadOnlyToaster />}
            <AccountChip account={account} demo={demo} onNavigate={() => setOpen(false)} />
          </div>
        </header>

        {demo && <DemoSideTab current={account?.login?.trim().toLowerCase()} />}
        <main className="min-w-0 flex-1 px-3.5 pb-24 pt-4 sm:px-5 lg:px-6 lg:pb-16 lg:pt-5">{children}</main>
      </div>
    </div>
  );
}
