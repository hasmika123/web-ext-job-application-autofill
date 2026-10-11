"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  cn,
  Menu,
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  ChartIcon,
  ChevronDownIcon,
  CreditCardIcon,
  DashboardIcon,
  FileTextIcon,
  GearIcon,
  HelpCircleIcon,
  MenuIcon,
  ShareNodesIcon,
  SignOutIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "@kiwiply/ui";
import BrandLogo from "@/components/marketing/BrandLogo";
import { contactHref } from "@/lib/catalog";
import { notifyExtension } from "@/lib/extension-signal";
import type { AppAccount } from "@/components/app-shell/AppShell";
import { InitialsAvatar, MascotCard, SearchInput } from "@/components/app-v2/common";
import OrgChip from "./OrgChip";

const ICON = "h-[18px] w-[18px]";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { href: "/org", label: "Dashboard", icon: <DashboardIcon className={ICON} /> },
  { href: "/org/team", label: "Team Management", icon: <UsersIcon className={ICON} /> },
  { href: "/org/opportunities", label: "Job Opportunities", icon: <BriefcaseIcon className={ICON} /> },
  { href: "/org/applications", label: "Applications", icon: <FileTextIcon className={ICON} /> },
  { href: "/org/interviews", label: "Interviews", icon: <CalendarIcon className={ICON} /> },
  { href: "/org/analytics", label: "Analytics & Reports", icon: <ChartIcon className={ICON} /> },
  { href: "/org/resumes", label: "AI Resume Support", icon: <SparklesIcon className={ICON} /> },
  { href: "/org/integrations", label: "Integrations", icon: <ShareNodesIcon className={ICON} /> },
  { href: "/org/billing", label: "Billing & Subscription", icon: <CreditCardIcon className={ICON} /> },
  { href: "/org/settings", label: "Settings", icon: <GearIcon className={ICON} /> },
];

function displayName(account?: AppAccount | null): string {
  if (account?.firstName) return [account.firstName, account.lastName].filter(Boolean).join(" ");
  return account?.login || account?.email || "Your account";
}

/**
 * Enterprise admin shell (APP-V2-SPEC §5): 236px sidebar (ten nav items, blue-soft active pill,
 * "Need Help?" mascot card), 64px top bar, drawer below `lg`. The shell is a client component
 * for the drawer + account menu; pages stay server components.
 */
export default function OrgShell({
  account,
  children,
}: {
  account?: AppAccount | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = displayName(account);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      notifyExtension("signedOut");
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-v2-canvas lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
      {/* Sidebar: sticky + full height on lg; off-canvas drawer below. */}
      <aside
        aria-label="Organization navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-[120] flex w-[264px] flex-col overflow-y-auto border-r border-v2-line bg-white px-3.5 pb-4 pt-5",
          "transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0 lg:border-r-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-5 flex items-center justify-between px-2">
          <Link href="/org" aria-label="Kiwiply" onClick={() => setOpen(false)}>
            <BrandLogo height={38} priority />
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-v2-muted hover:bg-[#F1F4FA] lg:hidden"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* The top bar has no room for the workspace chip below `lg`, so the drawer carries it. */}
        <div className="mb-4 px-2 lg:hidden">
          <OrgChip />
        </div>

        <nav className="flex flex-col gap-1" aria-label="Organization">
          {NAV.map((item) => {
            const active = item.href === "/org" ? pathname === "/org" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-[11px] text-[14px] transition-colors",
                  active
                    ? "bg-v2-blue-soft font-bold text-v2-blue"
                    : "font-medium text-v2-ink-soft hover:bg-[#F3F6FC] hover:text-v2-navy",
                )}
              >
                <span className="flex-none">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="min-h-6 flex-1" />

        <MascotCard
          mascot="/v2/app/mascot-help.png"
          title="Need Help?"
          body="Get setup support or speak to our team."
          cta={{ label: "Contact Support", href: contactHref("organization") }}
          tone="violet"
        />
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[110] bg-[rgba(27,31,94,.4)] lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-col">
        {/* Top bar, 64px */}
        <header className="sticky top-0 z-[60] flex h-16 items-center gap-3 bg-v2-canvas/90 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-v2-line bg-white text-v2-navy lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link href="/org" aria-label="Kiwiply" className="flex-none lg:hidden">
            <BrandLogo height={28} />
          </Link>

          {/* A wrapper, not a class on the chip: the chip's own `inline-flex` would beat `hidden`. */}
          <div className="hidden flex-none lg:block">
            <OrgChip />
          </div>
          <div className="hidden min-w-0 flex-1 md:block">
            <SearchInput
              placeholder="Search jobs, employees, applications..."
              size="md"
              wrapperClassName="max-w-[460px]"
              className="border-v2-line/60 bg-white/70"
            />
          </div>
          <div className="flex-1 md:hidden" />

          <div className="flex flex-none items-center gap-1.5 sm:gap-2.5">
            <button
              type="button"
              aria-label="Notifications, 1 unread"
              className="relative grid h-10 w-10 place-items-center rounded-xl text-v2-navy hover:bg-white"
            >
              <BellIcon className="h-[21px] w-[21px]" />
              <span className="absolute right-1.5 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-v2-coral px-1 text-[10px] font-bold leading-none text-white">
                1
              </span>
            </button>
            <Link
              href={contactHref("organization")}
              aria-label="Help and support"
              className="hidden h-10 w-10 place-items-center rounded-xl text-v2-navy hover:bg-white sm:grid"
            >
              <HelpCircleIcon className="h-[22px] w-[22px]" />
            </Link>
            <Menu
              align="end"
              trigger={
                <div className="flex cursor-pointer items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 hover:bg-white">
                  <InitialsAvatar name={name} size={38} tone="blue" />
                  <div className="hidden min-w-0 text-left sm:block">
                    <p className="max-w-[140px] truncate text-[14px] font-bold leading-tight text-v2-navy">{name}</p>
                    <p className="text-[12px] leading-tight text-v2-muted">Admin</p>
                  </div>
                  <ChevronDownIcon className="h-4 w-4 text-v2-muted" />
                </div>
              }
              items={[
                { label: "Switch to individual app", icon: <UserIcon className="h-4 w-4" />, onSelect: () => router.push("/dashboard") },
                { label: "Settings", icon: <GearIcon className="h-4 w-4" />, onSelect: () => router.push("/org/settings") },
                { separator: true },
                { label: busy ? "Signing out…" : "Sign out", icon: <SignOutIcon className="h-4 w-4" />, onSelect: signOut },
              ]}
            />
          </div>
        </header>

        <main className="min-w-0 px-4 pb-14 pt-2 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
