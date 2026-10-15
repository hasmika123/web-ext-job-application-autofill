"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BottomSheet,
  ChevronLeftIcon,
  IconButton,
  MemberAvatar,
  MenuIcon,
  SearchIcon,
  SignOutIcon,
  Tooltip,
  UserIcon,
  XIcon,
  cn,
  useBottomBar,
  useMediaQuery,
  useToast,
} from "@kiwiply/ui";
import TenantLogo from "@/components/ent/login/TenantLogo";
import { undoToast } from "@/lib/undo-toast";
import { activeKey, bannersFor, defaultTitle, navSections, primaryRoleName, switcherRows, type SwitcherRow } from "@/lib/ent/shell";
import { readCollapsed, readDismissed, readLandingPref, writeCollapsed, writeDismissed, writeLandingPref } from "@/lib/ent/shell-prefs";
import { bottomBar, showSwitcher, type MeTenant, type Workspace } from "@/lib/ent/workspaces";
import AccountMenu, { signOut } from "./AccountMenu";
import HelpCard from "./HelpCard";
import { NavIcon } from "./nav-icons";
import { ShellSlotContext, type PageHeaderValue } from "./ShellContext";
import ShellBell from "./ShellBell";
import ShellNav from "./ShellNav";
import ShellSearch from "./ShellSearch";
import { useAccessChanged } from "./useAccessChanged";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

export interface ShellTenant {
  displayName: string;
  logoUrl?: string | null;
  supportEmail?: string | null;
}

const SEARCH_INPUT_ID = "shell-search-input";

function Banner({ tone, children, onDismiss, id }: { tone: "info" | "warn"; children: ReactNode; onDismiss?: () => void; id: string }) {
  return (
    <div
      role="status"
      data-shell-banner={id}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-[13.5px] sm:px-6",
        tone === "warn" ? "border-warn/30 bg-warn/10 text-ink" : "border-[var(--brand-border,var(--color-line))] bg-accent-soft text-accent-deep",
      )}
    >
      <span className="min-w-0 flex-1 font-medium">{children}</span>
      {onDismiss ? (
        <IconButton aria-label="Dismiss" onClick={onDismiss} className="h-8 w-8">
          <XIcon size={16} />
        </IconButton>
      ) : null}
    </div>
  );
}

/**
 * EnterpriseShell (X2.16; docs/enterprise-v2/16 s2.1): the one frame every tenant page lives in. EVERYTHING it shows comes from the
 * tenant session (`GET /api/me/tenant`, X2.2) and the public tenant view: the menu is the API's filtered nav, the words are the
 * organization's terminology, the logo is the published one, the switcher exists only for members with several workspaces.
 *
 *   >= lg   sidebar of 15.4 % of the width, 216-258 px (the boards' 258 of 1672; sticky, viewport tall, scrolls by itself) + header
 *           with the title, one-line subtitle, search, bell and profile chip (no workspace chip and no help card: the boards have none;
 *           switching workspace lives in the profile menu, the help card is each page's own)
 *   md      the sidebar is a 64 px icon rail (expandable)
 *   < md    56 px top bar, the menu in a sheet, a bottom tab bar (first four items + More)
 *
 * Colours are the organization's `--brand-*` variables through the design-system tokens (`.theme-tenant`), never hex.
 */
export default function EnterpriseShell({
  me,
  etag,
  workspace,
  tenant,
  children,
}: {
  me: MeTenant;
  etag: string | null;
  workspace: Workspace;
  tenant: ShellTenant;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const toast = useToast();
  // The Resume Builder's editor (/w/<workspace>/resumes/<id>) is a full-bleed work surface: it fills the space under the shell's top bar, with no page padding and no phone tab bar.
  const focus = /\/w\/[^/]+\/resumes\/\d+\/?$/.test(pathname);
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const phone = useMediaQuery("(max-width: 767px)", false);

  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(null);
  const [header, setHeader] = useState<PageHeaderValue | null>(null);
  // pages that draw their own bee / help card claim them (ClaimsMascot / ClaimsHelpCard); the shell draws neither any more
  const [, setMascotClaimed] = useState(false);
  const [, setHelpClaimed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const firstPath = useRef(pathname);
  useBottomBar(tabsRef);

  const slot = useMemo(() => ({ setHeader, claimMascot: setMascotClaimed, claimHelp: setHelpClaimed }), []);
  const changed = useAccessChanged(etag);

  // Per-browser conveniences live in storage (an external store the server cannot see): read them once after hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCollapsedPref(readCollapsed());
    setDismissed(readDismissed());
    setPreferred(readLandingPref(me.org.id));
  }, [me.org.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A client navigation lands on the new page: close the sheets and move focus to the content (a keyboard user does not start over at the logo).
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    setNavOpen(false);
    setSearchOpen(false);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const multi = showSwitcher(me);
  const openSwitcher = () => {
    if (multi) setSwitcherOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "w" && multi) {
        e.preventDefault();
        setSwitcherOpen(true);
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.matchMedia("(min-width: 1360px)").matches) document.getElementById(SEARCH_INPUT_ID)?.focus();
        else setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [multi]);

  const collapsed = collapsedPref ?? !wide;
  const toggleCollapsed = () => {
    writeCollapsed(!collapsed);
    setCollapsedPref(!collapsed);
  };

  const sections = useMemo(() => navSections(workspace, me.org.terminology), [workspace, me.org.terminology]);
  const active = activeKey(workspace, pathname, search);
  const title = header?.title ?? defaultTitle(workspace, pathname, search, me.org.terminology);
  const subtitle = header?.subtitle ?? null;
  const rows = useMemo(() => switcherRows(me, workspace.key, preferred), [me, workspace.key, preferred]);
  const banners = bannersFor(me, workspace, changed).filter((b) => !dismissed.includes(b.id));
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };
  const firstName = me.person.name.trim().split(/\s+/)[0] ?? me.person.name;
  const { tabs } = bottomBar(workspace);

  const choose = (row: SwitcherRow) => {
    setSwitcherOpen(false);
    setNavOpen(false);
    if (!row.current) router.push(row.home);
  };
  const prefer = (row: SwitcherRow) => {
    const before = preferred;
    writeLandingPref(me.org.id, row.key);
    setPreferred(row.key);
    undoToast(toast, {
      title: `${row.label} opens first`,
      onUndo: () => {
        writeLandingPref(me.org.id, before);
        setPreferred(before);
      },
    });
  };

  const logo = <TenantLogo name={tenant.displayName} logoUrl={tenant.logoUrl} size="bar" />;
  const switcher = (variant: "panel" | "bar") => (
    <WorkspaceSwitcher
      rows={rows}
      open={switcherOpen && (variant === "bar") === phone}
      onOpenChange={setSwitcherOpen}
      onChoose={choose}
      onPrefer={prefer}
      variant={variant}
      currentLabel={workspace.label}
    />
  );

  return (
    <ShellSlotContext.Provider value={slot}>
      <div data-enterprise-shell data-focus={focus ? "true" : undefined} data-collapsed={collapsed ? "true" : "false"} className={cn("min-h-dvh bg-app-bg text-ink md:flex", focus && "flex h-dvh overflow-hidden")}>
        <a
          href="#main-content"
          className="sr-only z-[70] rounded-lg bg-paper px-4 py-2 text-sm font-semibold text-accent-deep shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>

        {/* ── sidebar (md and up) ─────────────────────────────────────────────────────────────── */}
        <aside
          aria-label="Sidebar"
          data-shell-sidebar
          data-rail={collapsed ? "true" : "false"}
          className="ent-sidebar sticky top-0 z-40 hidden h-dvh flex-none flex-col overflow-hidden md:flex"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className={cn("ent-sidebar-head flex flex-none items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
              <Link href={workspace.home} aria-label={`${tenant.displayName} home`} className="flex min-w-0 items-center rounded-lg" data-shell-logo>
                {collapsed ? (
                  <span aria-hidden className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent text-[16px] font-extrabold text-on-accent">
                    {tenant.displayName.slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <>
                    {logo}
                    {tenant.logoUrl ? (
                      <span aria-hidden data-shell-wordmark className="ent-wordmark ml-2.5 min-w-0 truncate font-extrabold uppercase leading-none tracking-tight">
                        {tenant.displayName.split(/\s+/)[0]}
                      </span>
                    ) : null}
                  </>
                )}
              </Link>
              {collapsed || wide ? null : (
                <Tooltip content="Collapse sidebar" side="right">
                  <IconButton aria-label="Collapse sidebar" onClick={toggleCollapsed} className="h-8 w-8 flex-none">
                    <ChevronLeftIcon size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </div>
            {collapsed ? (
              <div className="flex justify-center pb-2">
                <Tooltip content="Expand sidebar" side="right">
                  <IconButton aria-label="Expand sidebar" onClick={toggleCollapsed} className="h-8 w-8">
                    <ChevronLeftIcon size={16} className="rotate-180" />
                  </IconButton>
                </Tooltip>
              </div>
            ) : null}
            {/* the menu scrolls by itself; the logo above stays put (16 s2.1) */}
            <div data-shell-scroll className="ent-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <ShellNav sections={sections} active={active} collapsed={collapsed} />
            </div>
          </div>
        </aside>

        <div className={cn("flex min-w-0 flex-1 flex-col", focus && "min-h-0")}>
          {/* ── top bar, md and up ───────────────────────────────────────────────────────────── */}
          <header data-shell-topbar className="ent-header sticky top-0 z-30 hidden items-center bg-app-bg/95 py-3 backdrop-blur md:flex">
            <div className="min-w-0 flex-1" data-page-header>
              <h1 className="ent-title" title={title}>{title}</h1>
              {subtitle ? <p className="ent-subtitle" title={subtitle}>{subtitle}</p> : null}
            </div>
            <div className="ent-search-wrap hidden flex-none min-[1360px]:block">
              <ShellSearch me={me} inputId={SEARCH_INPUT_ID} />
            </div>
            <Tooltip content="Search" side="bottom" className="min-[1360px]:hidden">
              <IconButton aria-label="Search" onClick={() => setSearchOpen(true)} className="h-11 w-11 rounded-xl text-ink/80 min-[1360px]:hidden">
                <SearchIcon size={20} />
              </IconButton>
            </Tooltip>
            <ShellBell />
            <AccountMenu me={me} onSwitchWorkspace={openSwitcher} />
          </header>

          {/* ── top bar, phone ───────────────────────────────────────────────────────────────── */}
          <header data-shell-topbar-phone className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-paper px-3 md:hidden">
            <Link href={workspace.home} aria-label={`${tenant.displayName} home`} className="flex min-w-0 flex-none items-center rounded-lg pr-1" data-shell-logo>
              {logo}
            </Link>
            <div className="min-w-0 flex-1">
              {multi ? (
                switcher("bar")
              ) : (
                <span className="block truncate px-2 text-[13px] font-semibold text-muted">{workspace.label}</span>
              )}
            </div>
            <Tooltip content="Search" side="bottom">
              <IconButton aria-label="Search" onClick={() => setSearchOpen(true)} className="h-11 w-11">
                <SearchIcon size={20} />
              </IconButton>
            </Tooltip>
            <ShellBell />
            <Tooltip content="Menu" side="bottom">
              <IconButton aria-label="Open menu" aria-haspopup="dialog" aria-expanded={navOpen} onClick={() => setNavOpen(true)} className="h-11 w-11">
                <MenuIcon size={22} />
              </IconButton>
            </Tooltip>
          </header>

          {banners.map((b) =>
            b.id === "access-changed" ? (
              <Banner key={b.id} id={b.id} tone="info">
                Your access changed.{" "}
                <button type="button" onClick={() => window.location.reload()} className="font-bold underline underline-offset-2">
                  Reload
                </button>{" "}
                to see what you can do now.
              </Banner>
            ) : (
              <Banner key={b.id} id={b.id} tone="warn" onDismiss={() => dismiss(b.id)}>
                Your organization&apos;s payment is past due.{" "}
                {b.href ? (
                  <Link href={b.href} className="font-bold underline underline-offset-2">
                    Open billing
                  </Link>
                ) : null}
              </Banner>
            ),
          )}

          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            data-shell-main
            className={cn(
              "min-w-0 flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-4 focus:outline-none sm:px-6 md:pb-10 md:pt-2",
              focus && "flex min-h-0 flex-col overflow-hidden !p-0",
            )}
          >
            <div className={cn("mb-4 md:hidden", focus && "hidden")} data-page-header-phone>
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-[13.5px] text-muted">{subtitle}</p> : null}
            </div>
            {children}
          </main>
        </div>

        {/* the help panel the pages' own "Ask a question..." cards open (the sidebar card is gone; this is only the panel) */}
        <HelpCard firstName={firstName} orgName={tenant.displayName} supportEmail={tenant.supportEmail} cardHidden />
        {/* the workspace switcher (desktop): opened from the profile menu, or Ctrl+Shift+W */}
        {multi ? switcher("panel") : null}

        {/* ── bottom tab bar (phone) ───────────────────────────────────────────────────────── */}
        <nav
          ref={tabsRef}
          aria-label="Quick tabs"
          data-shell-tabs
          className={cn("fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden", focus && "hidden")}
          style={{ boxSizing: "content-box" }}
        >
          {tabs.map((t) => {
            const on = active === t.key;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold", on ? "text-accent-deep" : "text-muted")}
              >
                <NavIcon name={t.icon} size={22} />
                <span className="max-w-full truncate">{sections.flatMap((s) => s.items).find((i) => i.key === t.key)?.text ?? t.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setNavOpen(true)} className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold text-muted">
            <MenuIcon size={22} />
            <span>More</span>
          </button>
        </nav>

        {/* ── the full menu as a sheet (phone) ─────────────────────────────────────────────── */}
        <BottomSheet id="shell-menu" open={navOpen && phone} onClose={() => setNavOpen(false)} title={workspace.label} defaultSnap="full">
          <div className="-mx-1 flex items-center gap-3 border-b border-line px-3 pb-3">
            <MemberAvatar name={me.person.name} src={me.person.imageUrl} size={40} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[14px] font-semibold text-ink">{me.person.name}</p>
              <p className="truncate text-[12.5px] text-muted">{primaryRoleName(me)}</p>
            </div>
          </div>
          <ShellNav sections={sections} active={active} onNavigate={() => setNavOpen(false)} label="Menu" />
          <div className="mt-2 flex flex-col gap-1 border-t border-line px-3 pt-3">
            <Link href="/me" onClick={() => setNavOpen(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-medium text-ink hover:bg-paper-2">
              <UserIcon size={18} className="text-muted" /> My profile
            </Link>
            <button type="button" onClick={() => void signOut()} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-danger-text hover:bg-paper-2">
              <SignOutIcon size={18} /> Sign out
            </button>
          </div>
        </BottomSheet>

        {/* ── search overlay (tablet and phone: the inline box needs room) ─────────────────── */}
        {searchOpen ? (
          <div className="fixed inset-0 z-[60] bg-ink/40 p-3 pt-4 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && setSearchOpen(false)} data-shell-search-overlay>
            <div className="mx-auto max-w-xl" role="dialog" aria-label="Search">
              <ShellSearch me={me} autoFocus onDone={() => setSearchOpen(false)} />
            </div>
          </div>
        ) : null}
      </div>
    </ShellSlotContext.Provider>
  );
}
