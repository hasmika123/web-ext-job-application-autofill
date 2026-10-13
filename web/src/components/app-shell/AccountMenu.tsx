"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BuildingIcon, ChevronDownIcon, GearIcon, SignOutIcon, UserIcon, cn } from "@kiwiply/ui";
import { notifyExtension } from "@/lib/extension-signal";
import { clearOnboardingMirror } from "@/lib/onboarding/mirror";
import DemoBadge from "@/components/demo/DemoBadge";
import { DEMO_NOTE } from "@/lib/demo";

/**
 * Avatar + "Hi, <First>" + chevron (app v3), opening Profile · Settings ·
 * Kiwiply for Organizations · Sign out. Rendered in the page tree (not a portal) so the popover
 * keeps the `.theme-v2` tokens.
 */
export default function AccountMenu({
  initial,
  name,
  isPro,
  demo = false,
  orgsEnabled = false,
  onNavigate,
}: {
  initial: string;
  /** First name only: the chip reads "Hi, <First>". */
  name: string;
  isPro: boolean;
  /** A public demo account: shows a Demo badge and a read-only note. */
  demo?: boolean;
  /** The API's org feature flag (`/api/config/public`): the "Kiwiply for Organizations" entry is hidden while it is off. */
  orgsEnabled?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      notifyExtension("signedOut"); // the extension drops its own session at once (11.1)
      clearOnboardingMirror(); // a half-built profile on this device is not for the next person to see (Onboarding v2 R1.9)
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-ink hover:bg-paper-2";
  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-paper-2"
      >
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-v2-lime-soft text-[15px] font-extrabold text-v2-navy ring-2 ring-v2-lime/40">
          {initial}
        </span>
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-[150px] truncate text-[14px] font-bold text-ink">
            Hi, {name}
            {demo && <DemoBadge className="ml-1.5" />}
            {isPro && (
              <span className="ml-1.5 rounded-full bg-v2-lime-soft px-1.5 py-0.5 align-middle text-[9.5px] font-extrabold text-v2-green-ink">
                PRO
              </span>
            )}
          </span>
        </span>
        <ChevronDownIcon size={16} className={cn("hidden text-ink-soft transition-transform sm:block", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-[130] mt-2 w-[250px] rounded-2xl border border-line bg-paper p-1.5 shadow-[var(--shadow-lg)]"
        >
          {demo && (
            <p className="px-3 pb-1.5 pt-2 text-[12px] font-medium leading-snug text-v2-amber">{DEMO_NOTE}</p>
          )}
          <Link role="menuitem" href="/profiles" onClick={close} className={item}>
            <UserIcon size={17} className="text-ink-soft" />
            Profile
          </Link>
          <Link role="menuitem" href="/settings" onClick={close} className={item}>
            <GearIcon size={17} className="text-ink-soft" />
            Settings
          </Link>
          {orgsEnabled && (
            <Link role="menuitem" href="/org" onClick={close} className={item}>
              <BuildingIcon size={17} className="text-v2-blue" />
              Kiwiply for Organizations
            </Link>
          )}
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={signOut} disabled={busy} className={cn(item, "disabled:opacity-50")}>
            <SignOutIcon size={17} className="text-ink-soft" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
