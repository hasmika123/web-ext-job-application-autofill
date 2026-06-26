"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo, BetaBadge } from "@/components/ui";
import SignOutButton from "@/components/SignOutButton";

export interface AppAccount {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

type NavItem = { href: string; label: string; icon: React.ReactNode };

const COLLAPSE_KEY = "kiwiply_sidebar_collapsed";

// Sidebar collapse preference, read from localStorage via an external store so it
// hydrates cleanly (server snapshot = expanded) without a setState-in-effect.
function subscribeCollapse(cb: () => void) {
  window.addEventListener("kiwiply:sidebar", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("kiwiply:sidebar", cb);
    window.removeEventListener("storage", cb);
  };
}
function readCollapse() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function useCollapsedPref(): [boolean, (v: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribeCollapse, readCollapse, () => false);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("kiwiply:sidebar"));
  };
  return [collapsed, set];
}

// Stroke icons (24x24, currentColor) — clean and theme-aware.
const I = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  resumes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" />
    </svg>
  ),
  // Kanban columns sitting on a common baseline (ragged tops) — was upside-down (ragged bottoms).
  board: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="8" width="5" height="12" rx="1.5" /><rect x="10" y="4" width="5" height="16" rx="1.5" /><rect x="17" y="6" width="4" height="14" rx="1.5" />
    </svg>
  ),
  // Lucide "settings" gear — fits the 24x24 box (the old path clipped at the edges).
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: I.dashboard },
  { href: "/profile", label: "Profile", icon: I.profile },
  { href: "/resumes", label: "Resumes", icon: I.resumes },
  { href: "/board", label: "Application board", icon: I.board },
  { href: "/settings", label: "Settings", icon: I.settings },
];

function initialFor(account?: AppAccount): string {
  const src = account?.firstName || account?.login || account?.email || "?";
  return src.charAt(0).toUpperCase();
}

function displayName(account?: AppAccount): string {
  if (account?.firstName) return [account.firstName, account.lastName].filter(Boolean).join(" ");
  return account?.login || account?.email || "Your account";
}

export default function AppShell({
  account,
  children,
}: {
  account?: AppAccount | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useCollapsedPref();
  const toggleCollapsed = () => setCollapsed(!collapsed);

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={cn(
        "flex flex-1 flex-col bg-app-bg lg:grid lg:items-start",
        collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[236px_1fr]",
      )}
    >
      {/* Mobile top bar */}
      <div className="flex items-center gap-3 border-b border-line bg-paper px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="grid h-[38px] w-[38px] place-items-center rounded-[var(--radius)] border border-line bg-paper text-lg"
        >
          ☰
        </button>
        <Link href="/dashboard" aria-label="Kiwiply" className="flex items-center gap-2">
          <Logo height={26} />
          <BetaBadge />
        </Link>
      </div>

      {/* Sidebar — full-height & internally scrollable on lg (nav stays visible on long pages);
          off-canvas drawer below lg. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[120] flex w-[264px] flex-col gap-1.5 border-r border-line bg-paper p-5",
          "transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0 lg:overflow-y-auto",
          collapsed && "lg:p-3",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand — full lockup expanded; kiwi mark when collapsed (lg only) */}
        <Link
          href="/dashboard"
          aria-label="Kiwiply"
          onClick={() => setOpen(false)}
          className={cn("mb-4 flex items-center gap-2 px-2", collapsed && "lg:hidden")}
        >
          <Logo height={28} />
          <BetaBadge />
        </Link>
        <Link
          href="/dashboard"
          aria-label="Kiwiply"
          onClick={() => setOpen(false)}
          className={cn("mb-4 hidden items-center justify-center", collapsed && "lg:flex")}
        >
          <Image src="/logo-icon.png" alt="Kiwiply" width={32} height={32} className="rounded-[9px]" />
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-[11px] rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium",
                  active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-2",
                  collapsed && "lg:justify-center lg:gap-0 lg:px-0",
                )}
              >
                <span className={cn("flex-none", active ? "opacity-100" : "opacity-85")}>{item.icon}</span>
                <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (lg only) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-1 hidden items-center gap-[11px] rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-paper-2 lg:flex",
            collapsed && "lg:justify-center lg:gap-0 lg:px-0",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("h-[18px] w-[18px] flex-none transition-transform", collapsed && "rotate-180")}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className={cn("truncate", collapsed && "lg:hidden")}>Collapse</span>
        </button>

        <div className="flex-1" />

        {/* User chip */}
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-[var(--radius)] border border-line p-2.5",
            collapsed && "lg:justify-center lg:border-0 lg:p-1",
          )}
        >
          <span
            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-accent text-[13px] font-bold text-on-accent"
            title={collapsed ? displayName(account ?? undefined) : undefined}
          >
            {initialFor(account ?? undefined)}
          </span>
          <span
            className={cn("min-w-0 flex-1 truncate text-[13px] font-medium text-ink", collapsed && "lg:hidden")}
            title={displayName(account ?? undefined)}
          >
            {displayName(account ?? undefined)}
          </span>
        </div>
        <SignOutButton collapsed={collapsed} />
      </aside>

      {/* Scrim (mobile, when drawer open) */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[110] bg-[rgba(35,40,38,.45)] lg:hidden"
        />
      )}

      {/* Main content. The page (window) scrolls; the sidebar is sticky-pinned and the
          profile save bar sticks to the viewport bottom — so neither needs internal scroll. */}
      <main className="min-w-0 p-5 pb-14 lg:p-8 lg:pb-16">{children}</main>
    </div>
  );
}
