"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRightIcon, MenuIcon, XIcon, cn } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import BrandLogo from "../BrandLogo";
import { LOGIN_HREF, SIGNUP_HREF } from "../nav";

/** Header nav exactly as the landing-v3 board draws it (flat links, no dropdowns). */
const V3_NAV: { label: string; href: string }[] = [
  { label: "For Students", href: "/v3#individuals" },
  { label: "For Job Seekers", href: "/v3#apply" },
  { label: "For Employers", href: "/organizations" },
  { label: "Resources", href: "/about" },
  { label: "Pricing", href: "/pricing" },
];

const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Landing-v3 header: logo, five flat links, "Sign In" (outlined) and "Get Started →" (lime). Sticky
 * and transparent over the hero, turning into translucent white once the page scrolls. Below lg it
 * collapses to the logo and a hamburger that opens a full-width sheet (Escape closes, body scroll
 * is locked, focus returns to the button). Signed-in visitors get Dashboard + avatar instead of
 * the two buttons. The shared `MarketingHeader` is hidden on this route by the page (see
 * `app/(marketing)/v3/page.tsx`).
 */
export default function V3Header({ authed, initial }: { authed: boolean; initial: string }) {
  const uid = useId();
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) menuBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(true);
    }
    const mq = window.matchMedia(DESKTOP_QUERY);
    function onMq(e: MediaQueryListEvent) {
      if (e.matches) close(false);
    }
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open, close]);

  return (
    <header
      data-v3-header
      className={cn(
        "sticky top-0 z-40 -mb-16 transition-[background-color,backdrop-filter] duration-200 lg:-mb-[76px]",
        scrolled || open ? "bg-white/90 backdrop-blur" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-5 lg:h-[76px] lg:px-8">
        <Link href="/v3" aria-label="Kiwiply home" className="flex flex-none items-center">
          <BrandLogo priority className="h-[34px] lg:h-11" />
        </Link>

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex xl:ml-14 xl:gap-3">
          {V3_NAV.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-[var(--radius)] px-2.5 text-[14px] font-medium text-v2-navy transition-colors hover:bg-white/70 xl:px-3.5 xl:text-[15px]"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-3 md:flex">
            {authed ? (
              <>
                <Link href="/dashboard" className={buttonVariants("accent", "lg")}>
                  Dashboard
                </Link>
                <Link
                  href="/settings"
                  aria-label="Account settings"
                  className="grid h-10 w-10 flex-none place-items-center rounded-full bg-accent text-[14px] font-bold text-on-accent"
                >
                  {initial}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={LOGIN_HREF}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-[12px] border border-v2-line bg-white px-5 py-3 text-[15px] font-semibold leading-none text-v2-navy shadow-sm transition-shadow hover:shadow-v2-card"
                >
                  Sign In
                </Link>
                <Link
                  href={SIGNUP_HREF}
                  className={buttonVariants("accent", "lg", "whitespace-nowrap px-5 shadow-[0_6px_16px_rgba(95,191,31,.28)]")}
                >
                  Get Started
                  <ArrowRightIcon size={16} />
                </Link>
              </>
            )}
          </div>
          <button
            ref={menuBtnRef}
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls={`${uid}-sheet`}
            onClick={() => (open ? close(true) : setOpen(true))}
            className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-[var(--radius)] text-v2-navy transition-colors hover:bg-white/70 lg:hidden"
          >
            {open ? <XIcon size={20} /> : <MenuIcon size={24} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id={`${uid}-sheet`}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto bg-white shadow-v2-float lg:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto max-w-7xl px-5 py-3">
            <ul>
              {V3_NAV.map((l) => (
                <li key={l.label} className="border-b border-line">
                  <Link
                    href={l.href}
                    onClick={() => close(false)}
                    className="flex min-h-12 items-center text-base font-semibold text-v2-navy"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 pb-3 pt-5">
              {authed ? (
                <Link href="/dashboard" onClick={() => close(false)} className={buttonVariants("accent", "lg", "w-full")}>
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href={SIGNUP_HREF} onClick={() => close(false)} className={buttonVariants("accent", "lg", "w-full")}>
                    Get Started <ArrowRightIcon size={16} />
                  </Link>
                  <Link href={LOGIN_HREF} onClick={() => close(false)} className={buttonVariants("ghost", "lg", "w-full bg-white")}>
                    Sign In
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
