"use client";

import DemoSideTab from "@/components/demo/DemoSideTab";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  cn,
  Menu,
  EmptyState,
  BriefcaseIcon,
  buttonVariants,
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
import NotificationBell from "@/components/app-shell/NotificationBell";
import { InitialsAvatar, MascotCard, SearchInput } from "@/components/app-v2/common";
import DraftBanner from "./DraftBanner";
import OrgSwitcher from "./OrgSwitcher";
import { OrgProvider, useOrg } from "./OrgContext";
import { roleLabel } from "./org-labels";
import { navFor, navSpecFor, pathAllowed, type NavKey } from "./org-nav";
import type { CurrentOrg, OrgMine } from "@/lib/org-types";
import DemoBadge from "@/components/demo/DemoBadge";
import DemoReadOnlyToaster from "@/components/demo/DemoReadOnlyToaster";
import { DEMO_NOTE, isDemoLogin } from "@/lib/demo";

const ICON = "h-[18px] w-[18px]";

const ICONS: Record<NavKey, React.ReactNode> = {
  dashboard: <DashboardIcon className={ICON} />,
  team: <UsersIcon className={ICON} />,
  opportunities: <BriefcaseIcon className={ICON} />,
  applications: <FileTextIcon className={ICON} />,
  interviews: <CalendarIcon className={ICON} />,
  analytics: <ChartIcon className={ICON} />,
  resumes: <SparklesIcon className={ICON} />,
  integrations: <ShareNodesIcon className={ICON} />,
  billing: <CreditCardIcon className={ICON} />,
  settings: <GearIcon className={ICON} />,
};

function displayName(account?: AppAccount | null): string {
  if (account?.firstName) return [account.firstName, account.lastName].filter(Boolean).join(" ");
  return account?.login || account?.email || "Your account";
}

/**
 * Enterprise admin shell (APP-V2-SPEC §5): 236px sidebar (the pages this role may open, blue-soft active pill, "Need Help?"
 * mascot card), 64px top bar with the real org chip (the switcher), the real notifications bell and the account menu, drawer
 * below `lg`. The nav comes from `permissions[]` (`org-nav.ts`); a path outside the role's pages shows a calm "not part of your
 * role" instead of the page. The shell is a client component for the drawer + menus; pages stay server components.
 */
export default function OrgShell({
  account,
  current,
  orgs,
  children,
}: {
  account?: AppAccount | null;
  /** The org the layout resolved on the server, with the caller's role and permission keys (O1.6). */
  current: CurrentOrg;
  orgs: OrgMine[];
  children: React.ReactNode;
}) {
  return (
    <OrgProvider current={current} orgs={orgs}>
      <OrgShellFrame account={account}>{children}</OrgShellFrame>
    </OrgProvider>
  );
}

function OrgShellFrame({ account, children }: { account?: AppAccount | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, permissions } = useOrg();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = displayName(account);
  const demo = isDemoLogin(account?.login);
  const nav = navFor(permissions);
  const activeKey = navSpecFor(pathname)?.key;
  const canSettings = nav.some((n) => n.key === "settings");

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
            className="grid h-11 w-11 place-items-center rounded-lg text-v2-muted hover:bg-[#F1F4FA] lg:hidden"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Organization">
          {nav.map((item) => {
            const active = item.key === activeKey;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-[11px] text-[14px] transition-colors",
                  active
                    ? "bg-v2-blue-soft font-bold text-v2-blue"
                    : "font-medium text-v2-ink-soft hover:bg-[#F3F6FC] hover:text-v2-navy",
                )}
              >
                <span className="flex-none">{ICONS[item.key]}</span>
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
        <header className="sticky top-0 z-[60] flex h-16 items-center gap-2 bg-v2-canvas/90 px-3 backdrop-blur sm:gap-3 sm:px-4 lg:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-v2-line bg-white text-v2-navy lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link href="/org" aria-label="Kiwiply" className="hidden flex-none sm:block lg:hidden">
            <BrandLogo height={28} />
          </Link>

          {/* The real org chip, the switcher. It truncates its name so a phone keeps room for the bell and the account. */}
          <div className="min-w-0 flex-1 md:flex-none">
            <OrgSwitcher />
          </div>
          <div className="hidden min-w-0 flex-1 md:block">
            <SearchInput
              placeholder="Search jobs, employees, applications..."
              size="md"
              wrapperClassName="max-w-[460px]"
              className="border-v2-line/60 bg-white/70"
            />
          </div>

          <div className="flex flex-none items-center gap-1 sm:gap-2.5">
            <NotificationBell />
            <Link
              href={contactHref("organization")}
              aria-label="Help and support"
              className="hidden h-10 w-10 place-items-center rounded-xl text-v2-navy hover:bg-white sm:grid"
            >
              <HelpCircleIcon className="h-[22px] w-[22px]" />
            </Link>
            {demo && <DemoReadOnlyToaster />}
            <Menu
              align="end"
              trigger={
                <div className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl py-1 pl-1 pr-1.5 hover:bg-white sm:gap-2.5 sm:pr-2">
                  <InitialsAvatar name={name} size={38} tone="blue" />
                  <div className="hidden min-w-0 text-left sm:block">
                    <p className="flex max-w-[170px] items-center gap-1.5 text-[14px] font-bold leading-tight text-v2-navy">
                      <span className="truncate">{name}</span>
                      {demo && <DemoBadge />}
                    </p>
                    <p className="text-[12px] leading-tight text-v2-muted">{roleLabel(role)}</p>
                  </div>
                  <ChevronDownIcon className="h-4 w-4 text-v2-muted" />
                </div>
              }
              items={[
                ...(demo ? [{ heading: DEMO_NOTE }, { separator: true as const }] : []),
                { label: "Switch to individual app", icon: <UserIcon className="h-4 w-4" />, onSelect: () => router.push("/dashboard") },
                ...(canSettings ? [{ label: "Settings", icon: <GearIcon className="h-4 w-4" />, onSelect: () => router.push("/org/settings") }] : []),
                { separator: true },
                { label: busy ? "Signing out…" : "Sign out", icon: <SignOutIcon className="h-4 w-4" />, onSelect: signOut },
              ]}
            />
          </div>
        </header>

        {demo && <DemoSideTab current={account?.login?.trim().toLowerCase()} />}
        <main className="min-w-0 px-4 pb-24 lg:pb-14 pt-2 lg:px-6">
          {pathAllowed(pathname, permissions) ? (
            <>
              <DraftBanner />
              {children}
            </>
          ) : (
            <EmptyState
              mascot
              title="That page isn't part of your role"
              description={`You're a ${roleLabel(role).toLowerCase()} here. An owner or admin can open it for you.`}
              action={
                <Link href="/org" className={buttonVariants("primary", "md")}>
                  Back to the dashboard
                </Link>
              }
              className="mx-auto mt-6 max-w-lg"
            />
          )}
        </main>
      </div>
    </div>
  );
}
