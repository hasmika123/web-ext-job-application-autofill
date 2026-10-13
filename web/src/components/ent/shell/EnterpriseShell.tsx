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
 *   >= lg   236 px sidebar (sticky, viewport tall, scrolls by itself) + 64 px top bar
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
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const phone = useMediaQuery("(max-width: 767px)", false);

  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(null);
  const [header, setHeader] = useState<PageHeaderValue | null>(null);
  const [mascotClaimed, setMascotClaimed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const firstPath = useRef(pathname);
  useBottomBar(tabsRef);

  const slot = useMemo(() => ({ setHeader, claimMascot: setMascotClaimed }), []);
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
        if (window.matchMedia("(min-width: 1280px)").matches) document.getElementById(SEARCH_INPUT_ID)?.focus();
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
  const switcher = (variant: "sidebar" | "bar") => (
    <WorkspaceSwitcher
      rows={rows}
      open={switcherOpen && (variant === "bar") === phone}
      onOpenChange={setSwitcherOpen}
      onChoose={choose}
      onPrefer={prefer}
      variant={variant}
      collapsed={variant === "sidebar" && collapsed}
      currentLabel={workspace.label}
    />
  );

  return (
    <ShellSlotContext.Provider value={slot}>
      <div data-enterprise-shell data-collapsed={collapsed ? "true" : "false"} className="min-h-dvh bg-app-bg text-ink [--color-app-bg:color-mix(in_srgb,var(--brand-50,white)_55%,white)] [--color-paper-2:color-mix(in_srgb,var(--brand-50,white)_70%,white)] [--color-paper:white] md:flex">
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
          className={cn("sticky top-0 z-40 hidden h-dvh flex-none flex-col overflow-hidden border-r border-line bg-paper md:flex", collapsed ? "w-16" : "w-[236px]")}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className={cn("flex h-16 flex-none items-center", collapsed ? "justify-center" : "justify-between gap-2 pl-5 pr-3")}>
              <Link href={workspace.home} aria-label={`${tenant.displayName} home`} className="flex min-w-0 items-center rounded-lg" data-shell-logo>
                {collapsed ? (
                  <span aria-hidden className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent text-[16px] font-extrabold text-on-accent">
                    {tenant.displayName.slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  logo
                )}
              </Link>
              {collapsed ? null : (
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
            {multi ? (
              <div className="pb-1">{switcher("sidebar")}</div>
            ) : collapsed ? null : (
              <p data-workspace-eyebrow className="px-6 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                {workspace.label}
              </p>
            )}
            {/* the menu scrolls by itself; the header above and the help card below stay put (16 s2.1) */}
            <div data-shell-scroll className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-slim">
              <ShellNav sections={sections} active={active} collapsed={collapsed} />
            </div>
            <div className="flex-none pt-2">
              <HelpCard firstName={firstName} orgName={tenant.displayName} supportEmail={tenant.supportEmail} bee={!mascotClaimed} collapsed={collapsed} />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── top bar, md and up ───────────────────────────────────────────────────────────── */}
          <header data-shell-topbar className="sticky top-0 z-30 hidden min-h-16 items-center gap-4 border-b border-line bg-paper/95 px-6 py-2 backdrop-blur md:flex lg:px-8">
            <div className="min-w-0 flex-1" data-page-header>
              <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight text-ink lg:text-[26px]">{title}</h1>
              {subtitle ? <p className="mt-0.5 truncate text-[13.5px] text-muted">{subtitle}</p> : null}
            </div>
            <div className="hidden w-[min(480px,36vw)] flex-none xl:block">
              <ShellSearch me={me} inputId={SEARCH_INPUT_ID} />
            </div>
            <Tooltip content="Search" side="bottom" className="xl:hidden">
              <IconButton aria-label="Search" onClick={() => setSearchOpen(true)} className="h-11 w-11 rounded-xl text-ink/80 xl:hidden">
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
            className="min-w-0 flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-4 focus:outline-none sm:px-6 md:pb-10 md:pt-6 lg:px-8"
          >
            <div className="mb-4 md:hidden" data-page-header-phone>
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-[13.5px] text-muted">{subtitle}</p> : null}
            </div>
            {children}
          </main>
        </div>

        {/* ── bottom tab bar (phone) ───────────────────────────────────────────────────────── */}
        <nav
          ref={tabsRef}
          aria-label="Quick tabs"
          data-shell-tabs
          className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
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
