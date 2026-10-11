"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BookmarkOutlineIcon,
  BuildingIcon,
  CalendarIcon,
  ChartIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  FileTextIcon,
  GearIcon,
  GraduationCapIcon,
  HomeIcon,
  MenuIcon,
  MessageIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
  XIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import BrandLogo from "@/components/marketing/BrandLogo";
import MascotCard from "@/components/app-v2/common/MascotCard";
import NotificationBell from "@/components/app-shell/NotificationBell";
import AccountMenu from "@/components/app-shell/AccountMenu";

export interface AppAccount {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

type NavItem = { href: string; label: string; icon: ReactNode };

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

/** The 15 sidebar entries, in board order (spec section 3.1). */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: <HomeIcon className={ICON} /> },
  { href: "/jobs", label: "Job Search", icon: <SearchIcon className={ICON} /> },
  { href: "/ai-apply", label: "AI Apply", icon: <ZapIcon className={ICON} /> },
  { href: "/applications", label: "My Applications", icon: <ClipboardIcon className={ICON} /> },
  { href: "/interviews", label: "Interviews", icon: <CalendarIcon className={ICON} /> },
  { href: "/saved", label: "Saved Jobs", icon: <BookmarkOutlineIcon className={ICON} /> },
  { href: "/resume", label: "Resume", icon: <FileTextIcon className={ICON} /> },
  { href: "/ai-tools", label: "AI Tools", icon: <SparklesIcon className={ICON} /> },
  { href: "/insights", label: "Career Insights", icon: <ChartIcon className={ICON} /> },
  { href: "/messages", label: "Messages", icon: <MessageIcon className={ICON} /> },
  { href: "/companies", label: "Company Research", icon: <BuildingIcon className={ICON} /> },
  { href: "/networking", label: "Networking", icon: <UsersIcon className={ICON} /> },
  { href: "/learning", label: "Learning", icon: <GraduationCapIcon className={ICON} /> },
  { href: "/profile", label: "Profile", icon: <UserIcon className={ICON} /> },
  { href: "/settings", label: "Settings", icon: <GearIcon className={ICON} /> },
];

function initialFor(account?: AppAccount | null): string {
  const src = account?.firstName || account?.login || account?.email || "?";
  return src.charAt(0).toUpperCase();
}

/** "Priya S." — first name plus the last initial (the boards' format). */
function shortName(account?: AppAccount | null): string {
  if (account?.firstName) {
    const last = account.lastName?.trim().charAt(0);
    return last ? `${account.firstName} ${last.toUpperCase()}.` : account.firstName;
  }
  return account?.login || account?.email?.split("@")[0] || "Your account";
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
        collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[232px_1fr]",
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
                  "flex items-center gap-3 rounded-xl px-3 py-[9px] text-[14.5px] transition-colors",
                  active
                    ? "bg-v2-nav-active-bg font-bold text-v2-nav-active-text"
                    : "font-medium text-ink-soft hover:bg-paper-2 hover:text-ink",
                  collapsed && "lg:justify-center lg:gap-0 lg:px-0",
                )}
              >
                <span className={cn("flex-none", active ? "text-v2-navy" : "text-ink-soft")}>{item.icon}</span>
                <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
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

        {!isPro && (
          <div className={cn("mt-3", collapsed && "lg:hidden")}>
            <MascotCard
              title={
                <>
                  Upgrade to
                  <br />
                  Kiwiply Pro
                </>
              }
              body={["AI Apply to more jobs", "Advanced insights", "Priority support"]}
              cta={{ label: "Upgrade Now", href: "/pricing" }}
              mascot="/v2/app/mascot-grad.png"
              mascotSize={112}
              onNavigate={() => setOpen(false)}
            />
          </div>
        )}
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

          <form onSubmit={submitSearch} role="search" className="hidden min-w-0 max-w-[880px] flex-1 sm:block">
            <label className="relative block">
              <SearchIcon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-v2-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jobs, companies, or skills..."
                aria-label="Search jobs, companies, or skills"
                className="h-11 w-full rounded-xl border border-transparent bg-v2-blue-soft/60 pl-11 pr-4 text-[14px] text-ink outline-none transition-colors placeholder:text-v2-muted focus:border-v2-blue/40 focus:bg-paper focus-visible:ring-2 focus-visible:ring-v2-blue/25 [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
          </form>

          <div className="ml-auto flex flex-none items-center gap-1 sm:gap-2">
            <NotificationBell onNavigate={() => setOpen(false)} />
            <AccountMenu initial={initialFor(account)} name={shortName(account)} isPro={isPro} onNavigate={() => setOpen(false)} />
          </div>
        </header>

        {/* Main content. The page (window) scrolls; the sidebar is sticky-pinned. */}
        <main className="min-w-0 flex-1 px-3.5 pb-14 pt-4 sm:px-5 lg:px-6 lg:pb-16 lg:pt-5">{children}</main>
      </div>
    </div>
  );
}
