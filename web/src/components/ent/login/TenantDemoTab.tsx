"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, SparklesIcon, UserIcon, XIcon, cn } from "@kiwiply/ui";
import { roleLine, statusNote, type TenantDemoInfo, type TenantDemoMember } from "@/lib/ent/demo";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * "Demo accounts" (X1.12): a dev-style tab on the left edge of the TENANT sign-in, like the personal app's `DemoSideTab`, that
 * slides out a drawer with this organization's demo members ("Sarah Chen - Org Admin + Talent Marketing Manager"). One click
 * signs in as that member through `POST /api/auth/tenant-demo` and lands on the member's own workspace (the tenant root sends
 * them to the landing the API names).
 *
 * Config-only and enterprise-only: the list comes from the API (`GET /api/ent/demo`), which is empty unless the API's
 * DEMO_ENABLED and ENT_DEMO_SEED are on, and which never answers on a platform host. Off, this renders nothing (no tab, no
 * request cost beyond that one call). Themeable: every colour is a `--brand-*` variable of the host's published branding.
 * Suspended and invited members are listed (they are part of the scenarios) but cannot be opened.
 *
 * Pass `demo` when the list is already known (tests, the branding preview); otherwise it asks once.
 */
export default function TenantDemoTab({ demo: demoProp }: { demo?: TenantDemoInfo | null }) {
  const router = useRouter();
  const titleId = useId();
  const [fetched, setFetched] = useState<TenantDemoInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (demoProp !== undefined) return;
    let live = true;
    fetch("/api/ent/demo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TenantDemoInfo | null) => live && setFetched(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [demoProp]);

  const demo = demoProp !== undefined ? demoProp : fetched;
  const accounts = demo?.enabled ? demo.accounts : [];

  const close = useCallback(() => {
    setOpen(false);
    tabRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusTimer = window.setTimeout(() => panel?.querySelector<HTMLElement>("button")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (accounts.length === 0) return null;

  async function openDemo(m: TenantDemoMember) {
    if (!m.login || !m.canSignIn) return;
    setBusy(m.login);
    setError(null);
    try {
      const res = await fetch("/api/auth/tenant-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: m.login }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; landing?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't open the demo. Please try again.");
        return;
      }
      setOpen(false);
      router.push(typeof data.landing === "string" && data.landing.startsWith("/") ? data.landing : "/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-tenant-demo>
      <button
        ref={tabRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tenant-demo-tab
        className={cn(
          "fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 z-50 flex items-center justify-center gap-2 rounded-r-xl bg-[var(--brand-solid)] text-[var(--on-brand)] shadow-lg",
          "opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:opacity-100",
          "h-11 w-5 md:h-auto md:w-8 md:flex-col md:py-3 lg:w-11 lg:py-4",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-ring)]",
          open && "pointer-events-none opacity-0",
        )}
      >
        <SparklesIcon size={20} />
        <span className="sr-only md:not-sr-only md:rotate-180 md:text-[13px] md:font-bold md:tracking-wide md:[writing-mode:vertical-rl]">Demo accounts</span>
      </button>

      <div onClick={close} aria-hidden="true" className={cn("fixed inset-0 z-[70] bg-black/40 transition-opacity motion-reduce:transition-none", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-tenant-demo-panel
        className={cn(
          "fixed inset-y-0 left-0 z-[71] flex w-[min(400px,94vw)] flex-col overflow-y-auto bg-white p-5 shadow-2xl",
          "transition-[transform,visibility] duration-200 motion-reduce:transition-none",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--brand-subtle)] text-[var(--brand-text)]">
            <SparklesIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[16px] font-bold text-[var(--brand-900)]">
              Demo accounts
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--brand-800)]">
              {demo?.org ? `${demo.org}: ` : ""}pick a person to sign in as. No password, and this is sample data.
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close demo accounts" className="grid h-11 w-11 flex-none place-items-center rounded-xl text-[var(--brand-800)] hover:bg-[var(--brand-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-ring)]">
            <XIcon size={20} />
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-2.5">
          {accounts.map((m, i) => {
            const note = statusNote(m);
            const key = m.login ?? `invited-${i}`;
            return (
              <li key={key} data-demo-member={m.login ?? "invited"} data-status={m.status} className={cn("rounded-xl border border-[var(--brand-border)] bg-white p-3", !m.canSignIn && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--brand-subtle)] text-[var(--brand-text)]">
                    <UserIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-bold text-[var(--brand-900)]">{m.name}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-[var(--brand-800)]" data-demo-roles>
                      {roleLine(m)}
                    </p>
                    {note && <p className="mt-0.5 text-[12px] leading-snug text-[var(--brand-700)]">{note}</p>}
                  </div>
                </div>
                {m.canSignIn && (
                  <button
                    type="button"
                    onClick={() => void openDemo(m)}
                    disabled={busy !== null}
                    aria-label={`Sign in as ${m.name}`}
                    className="mt-2.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-solid)] px-4 py-2 text-[14.5px] font-bold text-[var(--on-brand)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-ring)]"
                  >
                    {busy === m.login ? "Signing in..." : "Sign in as this person"}
                    {busy !== m.login && <ArrowRightIcon size={16} />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-[13px] font-medium text-danger-text">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}
