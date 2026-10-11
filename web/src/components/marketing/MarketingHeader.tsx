"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRightIcon, ChevronDownIcon, MenuIcon, XIcon, cn } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import BrandLogo from "./BrandLogo";
import { LOGIN_HREF, NAV, SIGNUP_HREF, type NavGroup } from "./nav";

export interface MarketingHeaderProps {
  /** Visitor has a session cookie → Dashboard + avatar instead of Log in / Get Started. */
  authed: boolean;
  /** Avatar letter (from `/api/account`); "?" when unknown. */
  initial: string;
}

const DESKTOP_QUERY = "(min-width: 1024px)";

/** `/#pricing` anchors became the real `/pricing` page (spec 13): map them here whatever nav.ts says. */
const fixHref = (href: string) => (href === "/#pricing" ? "/pricing" : href);

/**
 * Landing-v2 marketing header. Sticky, transparent over the hero (no border, no Beta pill); it picks up
 * a translucent white blur only after the page scrolls. On `/` it overlays the hero (negative
 * bottom margin = its own height) so the hero's wash shows behind the nav. Desktop (>= lg): nav with click-to-open
 * dropdown panels (Enter/Space/ArrowDown open, Escape / outside click / focus-out close, arrow
 * keys move within). Below lg: a hamburger button opens a full-width sheet with accordion
 * groups and both CTAs; Escape closes, body scroll is locked while open, focus returns to the
 * button. The signed-in state (Dashboard + avatar) is preserved from the old header.
 */
export default function MarketingHeader({ authed, initial }: MarketingHeaderProps) {
  const uid = useId();
  const navRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const focusFirstRef = useRef(false);

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accordion, setAccordion] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const overlay = usePathname() === "/";

  // Transparent until the page has scrolled a few px (then translucent white + blur, no border).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── desktop dropdowns ─────────────────────────────────────────────────────────── */

  function closeGroup(returnFocus: boolean) {
    if (openGroup && returnFocus) {
      navRef.current?.querySelector<HTMLElement>(`[data-nav-trigger="${CSS.escape(openGroup)}"]`)?.focus();
    }
    setOpenGroup(null);
  }

  // Outside click closes the open dropdown.
  useEffect(() => {
    if (!openGroup) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [openGroup]);

  // After a keyboard open (ArrowDown), move focus into the panel once it has rendered.
  useEffect(() => {
    if (openGroup && focusFirstRef.current) {
      focusFirstRef.current = false;
      navRef.current?.querySelector<HTMLElement>(`[data-nav-panel="${CSS.escape(openGroup)}"] a`)?.focus();
    }
  }, [openGroup]);

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>, label: string) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusFirstRef.current = true;
      setOpenGroup(label);
    } else if (e.key === "Escape" && openGroup) {
      e.preventDefault();
      setOpenGroup(null);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // Roam across the top-level items.
      const tops = Array.from(navRef.current?.querySelectorAll<HTMLElement>("[data-nav-top]") ?? []);
      const i = tops.indexOf(e.currentTarget);
      if (i < 0 || tops.length === 0) return;
      e.preventDefault();
      tops[(i + (e.key === "ArrowRight" ? 1 : tops.length - 1)) % tops.length].focus();
    }
  }

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("a"));
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeGroup(true);
    }
  }

  /* ── mobile sheet ──────────────────────────────────────────────────────────────── */

  const closeMobile = useCallback((returnFocus: boolean) => {
    setMobileOpen(false);
    setAccordion(null);
    if (returnFocus) menuBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") closeMobile(true);
    }
    const mq = window.matchMedia(DESKTOP_QUERY);
    function onMq(e: MediaQueryListEvent) {
      if (e.matches) closeMobile(false);
    }
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [mobileOpen, closeMobile]);

  /* ── render ────────────────────────────────────────────────────────────────────── */

  const topLinkClass =
    "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius)] px-3.5 text-[15px] font-medium text-ink " +
    "transition-colors hover:bg-white/70";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,backdrop-filter] duration-200",
        overlay && "-mb-16 lg:-mb-[84px]",
        scrolled || mobileOpen ? "bg-white/85 backdrop-blur" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-5 lg:h-[84px] lg:px-8">
        <Link href="/" aria-label="Kiwiply home" className="flex flex-none items-center">
          <BrandLogo priority className="h-[34px] md:h-10 lg:h-11" />
        </Link>

        {/* Desktop nav */}
        <nav ref={navRef} aria-label="Main" className="ml-6 hidden items-center gap-1 lg:ml-10 lg:flex">
          {NAV.map((entry) => {
            if (entry.kind === "link") {
              return (
                <Link key={entry.label} href={fixHref(entry.href)} data-nav-top className={topLinkClass}>
                  {entry.label}
                </Link>
              );
            }
            const open = openGroup === entry.label;
            const panelId = `${uid}-${entry.label.replace(/\s+/g, "-")}`;
            return (
              <div key={entry.label} className="relative" onBlur={(e) => {
                if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenGroup(null);
              }}>
                <button
                  type="button"
                  data-nav-top
                  data-nav-trigger={entry.label}
                  aria-expanded={open}
                  aria-controls={open ? panelId : undefined}
                  onClick={() => setOpenGroup(open ? null : entry.label)}
                  onKeyDown={(e) => onTriggerKeyDown(e, entry.label)}
                  className={cn(topLinkClass, "cursor-pointer", open && "bg-paper-2")}
                >
                  {entry.label}
                  <ChevronDownIcon
                    size={14}
                    className={cn("transition-transform duration-150", open && "rotate-180")}
                  />
                </button>
                {open && (
                  <div
                    id={panelId}
                    data-nav-panel={entry.label}
                    onKeyDown={onPanelKeyDown}
                    className="absolute left-0 top-full z-50 mt-2 min-w-[240px] rounded-[var(--radius-v2-card)] border border-line bg-white p-2 shadow-v2-float"
                  >
                    {entry.items.map((item) => (
                      <Link
                        key={item.label}
                        href={fixHref(item.href)}
                        onClick={() => setOpenGroup(null)}
                        className="flex min-h-10 items-center rounded-[var(--radius)] px-3 text-[14.5px] font-medium text-ink-soft transition-colors hover:bg-v2-lime-soft hover:text-ink focus-visible:bg-v2-lime-soft focus-visible:text-ink"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          <div className="hidden items-center gap-2 md:flex lg:gap-3">
            {authed ? (
              <>
                <Link href="/dashboard" className={buttonVariants("accent", "lg")}>
                  Dashboard
                </Link>
                <AccountAvatar initial={initial} />
              </>
            ) : (
              <>
                <Link
                  href={LOGIN_HREF}
                  className="inline-flex items-center justify-center rounded-[12px] bg-white px-6 py-3 text-[15px] font-semibold leading-none text-ink shadow-v2-card transition-shadow hover:shadow-v2-float"
                >
                  Log in
                </Link>
                <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "shadow-[0_6px_16px_rgba(95,191,31,.28)]")}>
                  Get Started Free
                  <ArrowRightIcon size={16} />
                </Link>
              </>
            )}
          </div>

          <button
            ref={menuBtnRef}
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls={`${uid}-mobile`}
            onClick={() => (mobileOpen ? closeMobile(true) : setMobileOpen(true))}
            className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-[var(--radius)] bg-transparent text-ink transition-colors hover:bg-white/70 lg:hidden"
          >
            {mobileOpen ? <XIcon size={20} /> : <MenuIcon size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile sheet (< lg) — absolute under the bar so the header's backdrop-filter can't
          trap a fixed child. */}
      {mobileOpen && (
        <div
          id={`${uid}-mobile`}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto bg-white shadow-v2-float lg:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto max-w-7xl px-5 py-3">
            <ul className="flex flex-col">
              {NAV.map((entry) =>
                entry.kind === "link" ? (
                  <li key={entry.label} className="border-b border-line">
                    <Link
                      href={fixHref(entry.href)}
                      onClick={() => closeMobile(false)}
                      className="flex min-h-12 items-center text-base font-semibold text-ink"
                    >
                      {entry.label}
                    </Link>
                  </li>
                ) : (
                  <MobileGroup
                    key={entry.label}
                    group={entry}
                    open={accordion === entry.label}
                    onToggle={() => setAccordion(accordion === entry.label ? null : entry.label)}
                    onNavigate={() => closeMobile(false)}
                    idPrefix={uid}
                  />
                ),
              )}
            </ul>

            <div className="flex flex-col gap-3 pb-3 pt-5">
              {authed ? (
                <>
                  <Link href="/dashboard" onClick={() => closeMobile(false)} className={buttonVariants("accent", "lg", "w-full")}>
                    Dashboard
                  </Link>
                  <Link href="/settings" onClick={() => closeMobile(false)} className={buttonVariants("ghost", "lg", "w-full bg-white")}>
                    Account settings
                  </Link>
                </>
              ) : (
                <>
                  <Link href={SIGNUP_HREF} onClick={() => closeMobile(false)} className={buttonVariants("accent", "lg", "w-full")}>
                    Get Started Free
                    <ArrowRightIcon size={16} />
                  </Link>
                  <Link href={LOGIN_HREF} onClick={() => closeMobile(false)} className={buttonVariants("ghost", "lg", "w-full bg-white")}>
                    Log in
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function AccountAvatar({ initial }: { initial: string }) {
  return (
    <Link
      href="/settings"
      aria-label="Account settings"
      title="Account settings"
      className="grid h-10 w-10 flex-none place-items-center rounded-full bg-accent text-[14px] font-bold text-on-accent transition-transform hover:scale-105"
    >
      {initial}
    </Link>
  );
}

function MobileGroup({
  group,
  open,
  onToggle,
  onNavigate,
  idPrefix,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  idPrefix: string;
}) {
  const panelId = `${idPrefix}-m-${group.label.replace(/\s+/g, "-")}`;
  return (
    <li className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onToggle}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between text-left text-base font-semibold text-ink"
      >
        {group.label}
        <ChevronDownIcon size={18} className={cn("transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <ul id={panelId} className="flex flex-col pb-2">
          {group.items.map((item) => (
            <li key={item.label}>
              <Link
                href={fixHref(item.href)}
                onClick={onNavigate}
                className="flex min-h-11 items-center rounded-[var(--radius)] px-3 text-[15px] font-medium text-ink-soft hover:bg-v2-lime-soft hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
