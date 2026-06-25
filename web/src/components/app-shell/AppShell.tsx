"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui";
import SignOutButton from "@/components/SignOutButton";

export interface AppAccount {
  login?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

type NavItem = { href: string; label: string; icon: React.ReactNode };

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
  board: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="17" y="4" width="4" height="14" rx="1.5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 12a1.65 1.65 0 0 0-1.18-.51 2 2 0 0 1 0-4 1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 3.18 1.65 1.65 0 0 0 10 1.82 2 2 0 0 1 14 1.82a1.65 1.65 0 0 0 1 1.36 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21 9c.36.14.66.4.87.73" />
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

  return (
    <div className="flex flex-1 flex-col bg-app-bg lg:grid lg:grid-cols-[236px_1fr]">
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
        <Link href="/dashboard" aria-label="Kiwiply">
          <Logo height={26} />
        </Link>
      </div>

      {/* Sidebar (persistent ≥lg, off-canvas drawer below) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[120] flex w-[264px] flex-col gap-1.5 border-r border-line bg-paper p-5",
          "transition-transform duration-200 ease-out",
          "lg:static lg:z-auto lg:w-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/dashboard" aria-label="Kiwiply" className="mb-4 px-2" onClick={() => setOpen(false)}>
          <Logo height={28} />
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
                className={cn(
                  "flex items-center gap-[11px] rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium",
                  active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-2",
                )}
              >
                <span className={active ? "opacity-100" : "opacity-85"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* User chip */}
        <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-line p-2.5">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-accent text-[13px] font-bold text-on-accent">
            {initialFor(account ?? undefined)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink" title={displayName(account ?? undefined)}>
            {displayName(account ?? undefined)}
          </span>
        </div>
        <SignOutButton />
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

      {/* Main content */}
      <main className="overflow-auto p-5 pb-14 lg:p-8 lg:pb-16">{children}</main>
    </div>
  );
}
