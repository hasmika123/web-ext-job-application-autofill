"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChartIcon,
  BellIcon,
  BookmarkOutlineIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  CompassIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  MenuIcon,
  MessageIcon,
  MicIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
  XIcon,
  cn,
} from "@kiwiply/ui";
import BrandLogo from "@/components/marketing/BrandLogo";
import PlanCard from "@/components/app-v2/common/PlanCard";
import NotificationBell from "@/components/app-shell/NotificationBell";
import AccountMenu from "@/components/app-shell/AccountMenu";
import DemoReadOnlyToaster from "@/components/demo/DemoReadOnlyToaster";
import { isDemoLogin } from "@/lib/demo";

export interface AppAccount {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

type NavItem = { href: string; label: string; icon: ReactNode; dot?: boolean };

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

const ICON = "h-[18px] w-[18px]";

/** The 13 sidebar entries, in board order (APP-V3-SPEC section 1). `dot` = the red unread dot. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <HomeIcon className={ICON} /> },
  { href: "/jobs", label: "Job Search", icon: <SearchIcon className={ICON} /> },
  { href: "/applications", label: "Applications", icon: <ClipboardIcon className={ICON} /> },
  { href: "/profiles", label: "My Profiles", icon: <UserIcon className={ICON} /> },
  { href: "/assistant", label: "AI Assistant", icon: <SparklesIcon className={ICON} /> },
  { href: "/alerts", label: "Job Alerts", icon: <BellIcon className={ICON} /> },
  { href: "/resume-builder", label: "Resume Builder", icon: <FileTextIcon className={ICON} /> },
  { href: "/interview-prep", label: "Interview Prep", icon: <MicIcon className={ICON} /> },
  { href: "/messages", label: "Messages", icon: <MessageIcon className={ICON} />, dot: true },
  { href: "/saved", label: "Saved Jobs", icon: <BookmarkOutlineIcon className={ICON} /> },
  { href: "/explore", label: "Explore", icon: <CompassIcon className={ICON} /> },
  { href: "/analytics", label: "Analytics", icon: <BarChartIcon className={ICON} /> },
  { href: "/settings", label: "Settings", icon: <GearIcon className={ICON} /> },
];

function initialFor(account?: AppAccount | null): string {
  const src = account?.firstName || account?.login || account?.email || "?";
  return src.charAt(0).toUpperCase();
}

/** First name for the "Hi, <First>" chip. */
function firstNameOf(account?: AppAccount | null): string {
  return account?.firstName?.trim() || account?.login || account?.email?.split("@")[0] || "there";
}

export default function AppShell({
  account,
  isPro = false,
  children,
}: {
  account?: AppAccount | null;
  /** Hides the Upgrade card and adds a Pro pill. Display only: entitlement is enforced server-side. */
  isPro?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useCollapsedPref();
  const toggleCollapsed = () => setCollapsed(!collapsed);
  const demo = isDemoLogin(account?.login);

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/jobs?q=${encodeURIComponent(q)}` : "/jobs");
  }

  return (
    <div
      className={cn(
        "flex flex-1 flex-col bg-v2-canvas lg:grid lg:items-start",
        collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[220px_1fr]",
      )}
    >
      {/* Sidebar: full-height and internally scrollable on lg; off-canvas drawer below lg. */}
      <aside
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-[120] flex w-[272px] flex-col gap-1 overflow-y-auto border-r border-line/70 bg-paper px-3.5 pb-4 pt-4",
          "transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0",
          collapsed && "lg:px-2.5",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand: full lockup expanded; kiwi mark when collapsed (lg only). */}
        <div className={cn("mb-3 flex h-12 items-center justify-between px-1.5", collapsed && "lg:justify-center")}>
          <Link href="/" aria-label="Kiwiply" onClick={() => setOpen(false)} className={cn(collapsed && "lg:hidden")}>
            <BrandLogo height={40} priority />
          </Link>
          <Link
            href="/"
            aria-label="Kiwiply"
            onClick={() => setOpen(false)}
            className={cn("hidden", collapsed && "lg:block")}
          >
            <Image src="/logo-icon.png" alt="Kiwiply" width={36} height={36} className="rounded-[10px]" />
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

        <nav aria-label="Main" className="flex flex-col gap-0.5">
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
                  "flex items-center gap-3 rounded-xl px-3 py-[9px] text-[14px] transition-colors",
                  active
                    ? "bg-v2-nav-active-bg font-bold text-v2-nav-active-text"
                    : "font-medium text-ink-soft hover:bg-paper-2 hover:text-ink",
                  collapsed && "lg:justify-center lg:gap-0 lg:px-0",
                )}
              >
                <span className={cn("relative flex-none", active ? "text-v2-nav-active-text" : "text-ink-soft")}>
                  {item.icon}
                  {item.dot && (
                    <span
                      aria-hidden
                      className={cn("absolute -right-0.5 -top-0.5 hidden h-2 w-2 rounded-full bg-v2-coral ring-2 ring-paper", collapsed && "lg:block")}
                    />
                  )}
                </span>
                <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                {item.dot && (
                  <span
                    role="img"
                    aria-label="Unread messages"
                    className={cn("ml-auto h-2 w-2 flex-none rounded-full bg-v2-coral", collapsed && "lg:hidden")}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (lg only). */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-1 hidden items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-muted hover:bg-paper-2 lg:flex",
            collapsed && "lg:justify-center lg:gap-0 lg:px-0",
          )}
        >
          <ChevronLeftIcon className={cn("h-[16px] w-[16px] flex-none transition-transform", collapsed && "rotate-180")} />
          <span className={cn("truncate", collapsed && "lg:hidden")}>Collapse</span>
        </button>

        <PlanCard isPro={isPro} className={cn("mt-auto pt-3", collapsed && "lg:hidden")} onNavigate={() => setOpen(false)} />
      </aside>

      {/* Scrim (below lg, when the drawer is open). */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[110] bg-[rgba(15,19,64,.42)] lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar, 64px: search, bell, account. */}
        <header className="sticky top-0 z-30 flex h-16 flex-none items-center gap-2 border-b border-line/60 bg-paper/90 px-3 backdrop-blur sm:gap-3 sm:px-5 lg:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 flex-none place-items-center rounded-full text-ink hover:bg-paper-2 lg:hidden"
          >
            <MenuIcon size={22} />
          </button>
          <Link href="/" aria-label="Kiwiply" className="flex-none sm:hidden">
            <BrandLogo height={30} />
          </Link>

          <form onSubmit={submitSearch} role="search" className="hidden min-w-0 max-w-[560px] flex-1 sm:block">
            <label className="relative block">
              <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for jobs, companies, or skills..."
                aria-label="Search for jobs, companies, or skills"
                className="h-11 w-full rounded-xl border border-transparent bg-v2-blue-soft/60 pl-11 pr-4 text-[14px] text-ink outline-none transition-colors placeholder:text-v2-muted focus:border-v2-blue/40 focus:bg-paper focus-visible:ring-2 focus-visible:ring-v2-blue/25 [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
          </form>

          <div className="ml-auto flex flex-none items-center gap-1 sm:gap-2">
            <NotificationBell onNavigate={() => setOpen(false)} />
            {demo && <DemoReadOnlyToaster />}
            <AccountMenu
              initial={initialFor(account)}
              name={firstNameOf(account)}
              isPro={isPro}
              demo={demo}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </header>

        {/* Main content. The page (window) scrolls; the sidebar is sticky-pinned. */}
        <main className="min-w-0 flex-1 px-3.5 pb-14 pt-4 sm:px-5 lg:px-6 lg:pb-16 lg:pt-5">{children}</main>
      </div>
    </div>
  );
}
