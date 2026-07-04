"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo, BetaBadge } from "@/components/ui";
import { BoardIcon, ChevronLeftIcon, DashboardIcon, FileTextIcon, GearIcon, UserIcon } from "@kiwiply/ui";
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

// Shared stroke icons (@kiwiply/ui) — clean and theme-aware.
const ICON = "h-[18px] w-[18px]";
const I = {
  dashboard: <DashboardIcon className={ICON} />,
  profile: <UserIcon className={ICON} />,
  resumes: <FileTextIcon className={ICON} />,
  board: <BoardIcon className={ICON} />,
  settings: <GearIcon className={ICON} />,
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
        <Link href="/" aria-label="Kiwiply" className="flex items-center gap-2">
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
          href="/"
          aria-label="Kiwiply"
          onClick={() => setOpen(false)}
          className={cn("mb-4 flex items-center gap-2 px-2", collapsed && "lg:hidden")}
        >
          <Logo height={28} />
          <BetaBadge />
        </Link>
        <Link
          href="/"
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
          <ChevronLeftIcon
            className={cn("h-[18px] w-[18px] flex-none transition-transform", collapsed && "rotate-180")}
          />
          <span className={cn("truncate", collapsed && "lg:hidden")}>Collapse</span>
        </button>

        <div className="flex-1" />

        {/* User chip — opens Settings. Sign out stays a separate control below. */}
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          aria-label="Account settings"
          title={collapsed ? displayName(account ?? undefined) : "Account settings"}
          className={cn(
            "flex items-center gap-2.5 rounded-[var(--radius)] border border-line p-2.5 transition-colors hover:bg-paper-2",
            collapsed && "lg:justify-center lg:border-0 lg:p-1",
          )}
        >
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-accent text-[13px] font-bold text-on-accent">
            {initialFor(account ?? undefined)}
          </span>
          <span
            className={cn("min-w-0 flex-1 truncate text-[13px] font-medium text-ink", collapsed && "lg:hidden")}
            title={displayName(account ?? undefined)}
          >
            {displayName(account ?? undefined)}
          </span>
        </Link>
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
