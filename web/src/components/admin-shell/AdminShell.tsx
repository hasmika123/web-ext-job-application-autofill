"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  AiIcon,
  BugIcon,
  ChartIcon,
  ChevronLeftIcon,
  DashboardIcon,
  FileTextIcon,
  MailIcon,
  MonitorIcon,
  ShieldIcon,
  UsersIcon,
} from "@kiwiply/ui";

export interface AdminAccount {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  authorities?: string[];
}

type NavItem = { href: string; label: string; icon: React.ReactNode; soon?: boolean };

// Shared stroke icons (@kiwiply/ui).
const ICON = "h-[18px] w-[18px] flex-none";
const I = {
  overview: <DashboardIcon className={ICON} />,
  users: <UsersIcon className={ICON} />,
  ai: <AiIcon className={ICON} />,
  security: <ShieldIcon className={ICON} />,
  analytics: <ChartIcon className={ICON} />,
  email: <MailIcon className={ICON} />,
  bug: <BugIcon className={ICON} />,
  system: <MonitorIcon className={ICON} />,
  audit: <FileTextIcon className={ICON} />,
  back: <ChevronLeftIcon className={ICON} />,
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: I.overview },
  { href: "/admin/users", label: "Users", icon: I.users },
  { href: "/admin/ai", label: "AI usage", icon: I.ai },
  { href: "/admin/security", label: "Security", icon: I.security, soon: true },
  { href: "/admin/analytics", label: "Analytics", icon: I.analytics },
  { href: "/admin/subscribers", label: "Email", icon: I.email },
  { href: "/admin/bug-reports", label: "Bug reports", icon: I.bug },
  { href: "/admin/system", label: "System", icon: I.system },
  { href: "/admin/audit", label: "Audit log", icon: I.audit },
];

function displayName(account?: AdminAccount): string {
  if (account?.firstName) return [account.firstName, account.lastName].filter(Boolean).join(" ");
  return account?.login || account?.email || "Admin";
}

function AdminBadge() {
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-accent">
      Admin
    </span>
  );
}

// The real Kiwiply lockup, light variant for the dark sidebar (public/logo-dark-mode.png).
// Width follows the lockup's intrinsic aspect ratio (1713×488, same as logo.svg).
function AdminLogo({ height }: { height: number }) {
  const width = Math.round((height * 1713) / 488);
  return (
    <Image src="/logo-dark-mode.png" alt="Kiwiply" width={width} height={height} priority className="block h-auto w-auto" style={{ height, width }} />
  );
}

/**
 * Admin console shell (Phase 9.A1). Deliberately distinct from the user AppShell — a dark
 * charcoal sidebar + an "Admin" badge signal you're operating the service, not using it.
 * Items not yet built show a muted "Soon" tag instead of a broken link; each lights up as
 * its phase lands (Users A1.3, Audit later in A1, AI/Security/… A2+).
 */
export default function AdminShell({ account, children }: { account?: AdminAccount | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-app-bg lg:grid lg:grid-cols-[248px_1fr] lg:items-start">
      {/* Mobile top bar */}
      <div className="flex items-center gap-3 border-b border-line bg-ink px-4 py-3 text-paper lg:hidden">
        <button
          type="button"
          aria-label="Open admin menu"
          onClick={() => setOpen(true)}
          className="grid h-[38px] w-[38px] place-items-center rounded-[var(--radius)] border border-white/20 text-lg"
        >
          ☰
        </button>
        <span className="flex items-center gap-2">
          <AdminLogo height={22} />
          <AdminBadge />
        </span>
      </div>

      {/* Sidebar — dark, to differentiate the admin surface */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[120] flex w-[264px] flex-col gap-1.5 bg-ink p-5 text-paper",
          "transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0 lg:overflow-y-auto",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/admin" onClick={() => setOpen(false)} aria-label="Kiwiply admin" className="mb-5 flex items-center gap-2 px-2">
          <AdminLogo height={26} />
          <AdminBadge />
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            // Exact match for Overview ("/admin"); prefix match for the deeper sections — otherwise
            // "/admin" (a prefix of every admin route) would light up Overview on every page.
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
            if (item.soon) {
              return (
                <span
                  key={item.href}
                  aria-disabled
                  className="flex items-center gap-[11px] rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium text-paper/40"
                >
                  <span className="flex-none">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper/55">
                    Soon
                  </span>
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-[11px] rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium",
                  active ? "bg-paper text-ink" : "text-paper/85 hover:bg-white/10",
                )}
              >
                <span className="flex-none">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="flex items-center gap-[11px] rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium text-paper/70 hover:bg-white/10"
        >
          <span className="flex-none">{I.back}</span>
          <span className="truncate">Back to app</span>
        </Link>

        <div className="mt-1 flex items-center gap-2.5 rounded-[var(--radius)] border border-white/15 p-2.5">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-accent text-[13px] font-bold text-on-accent">
            {(displayName(account ?? undefined).charAt(0) || "A").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-paper" title={displayName(account ?? undefined)}>
            {displayName(account ?? undefined)}
          </span>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-1 flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-paper/85 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[110] bg-[rgba(35,40,38,.45)] lg:hidden"
        />
      )}

      <main className="min-w-0 p-5 pb-14 lg:p-8 lg:pb-16">{children}</main>
    </div>
  );
}
