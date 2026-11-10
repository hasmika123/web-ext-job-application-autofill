"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, BuildingIcon, CheckIcon, SparklesIcon, UserIcon, XIcon } from "@kiwiply/ui";
import { cn } from "@/lib/cn";
import { track } from "@/lib/analytics";
import { notifyExtension } from "@/lib/extension-signal";
import { tenantDemoLoginUrl, type DemoAccount, type DemoInfo } from "@/lib/demo";

/**
 * What each demo login is and what you will see inside. The API decides which accounts are on
 * offer (and supplies label/description); a login the API doesn't return is never shown. The
 * "sees" copy is static. `demo-admin` is offered only while the API's `DEMO_ADMIN_ENABLED` is on, so the app admin card is
 * absent otherwise. There is no organization persona: organization accounts sign in on their own tenant host (decision O4), so
 * the panel only LINKS to the demo company's sign-in (see `tenantDemo`).
 */
const PERSONAS: Record<string, { icon: typeof UserIcon; fallbackLabel: string; fallbackBlurb: string; sees: string }> = {
  demo: {
    icon: UserIcon,
    fallbackLabel: "Job seeker",
    fallbackBlurb: "A ready-made job search: a profile, resumes and an application board.",
    sees: "Dashboard, job matches, applications, saved jobs and profiles",
  },
  "demo-admin": {
    icon: SparklesIcon,
    fallbackLabel: "App admin",
    fallbackBlurb: "Kiwiply's own admin console, for running the platform.",
    sees: "Users, customers, organizations, pricing and plans, AI usage and providers, analytics, system settings and the audit log",
  },
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * "Demo accounts": a tab pinned to the left edge of the viewport (vertically centred) that slides
 * out a drawer listing the demo accounts (APP-V2-SPEC section 9.2). On the login page it opens a
 * demo; inside a demo session (`current` set) it switches between them.
 *
 * Pass `demo` when the server already knows it (login page); otherwise it asks `GET /api/demo`
 * once. Renders nothing when the demo is off.
 */
export default function DemoSideTab({ demo: demoProp, current }: { demo?: DemoInfo | null; current?: string | null }) {
  const router = useRouter();
  const titleId = useId();
  const [fetched, setFetched] = useState<DemoInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (demoProp !== undefined) return;
    let live = true;
    fetch("/api/demo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DemoInfo | null) => live && setFetched(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [demoProp]);

  const demo = demoProp !== undefined ? demoProp : fetched;
  const offered = demo?.enabled ? demo.accounts.filter((a) => a.login in PERSONAS) : [];
  const tenantDemo = demo?.enabled ? (demo.tenantDemo ?? null) : null;
  // Built in the browser (it needs the visitor's own port in dev); the drawer is closed on the server render, so this is "" there.
  const tenantHref = open && tenantDemo ? tenantDemoLoginUrl(tenantDemo, window.location) : "";

  const close = useCallback(() => {
    setOpen(false);
    tabRef.current?.focus();
  }, []);

  // Esc closes; Tab stays inside the drawer; focus moves in on open.
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

  if (offered.length === 0) return null;

  async function openDemo(account: DemoAccount) {
    setBusy(account.login);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: account.login }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.landing !== "string") {
        setError(data.error ?? "Couldn't open the demo. Please try again.");
        return;
      }
      track("login", { method: "demo", account: account.login });
      notifyExtension("changed");
      setOpen(false);
      router.push(data.landing);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 z-50 rounded-r-xl opacity-60 hover:opacity-100 focus-visible:opacity-100 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:opacity-100 bg-v2-green-ink text-white shadow-lg",
          "flex items-center justify-center gap-2 transition-opacity hover:opacity-90",
          "h-11 w-5 md:h-auto md:w-8 md:flex-col md:py-3 lg:w-11 lg:py-4",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          open && "pointer-events-none opacity-0",
        )}
      >
        <SparklesIcon size={20} />
        <span className="sr-only md:not-sr-only md:rotate-180 md:text-[13px] md:font-bold md:tracking-wide md:[writing-mode:vertical-rl]">
          Demo accounts
        </span>
      </button>

      <div
        onClick={close}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-[70] bg-v2-navy/40 transition-opacity motion-reduce:transition-none",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "fixed inset-y-0 left-0 z-[71] flex w-[min(380px,92vw)] flex-col overflow-y-auto bg-white p-5 shadow-2xl",
          "transition-[transform,visibility] duration-200 motion-reduce:transition-none",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-v2-lime-soft text-v2-green">
            <SparklesIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[16px] font-bold text-v2-navy">
              Demo accounts
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-v2-ink-soft">
              {current ? "Switch between the demos." : "Pick an account to explore."} No signup, and changes
              aren&apos;t saved.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close demo accounts"
            className="grid h-11 w-11 flex-none place-items-center rounded-xl text-v2-ink-soft hover:bg-v2-lime-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <XIcon size={20} />
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {offered.map((account) => {
            const p = PERSONAS[account.login];
            const Icon = p.icon;
            const isCurrent = current === account.login;
            return (
              <li
                key={account.login}
                className={cn(
                  "rounded-xl border bg-white p-3.5",
                  isCurrent ? "border-v2-green ring-2 ring-v2-green/30" : "border-v2-line",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid h-10 w-10 flex-none place-items-center rounded-full",
                      isCurrent ? "bg-v2-green text-white" : "bg-v2-lime-soft text-v2-green",
                    )}
                  >
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-bold text-v2-navy">
                      {account.label || p.fallbackLabel}
                      {isCurrent && (
                        <span className="ml-2 inline-flex items-center gap-1 align-middle text-[11px] font-bold text-v2-green">
                          <CheckIcon size={12} /> Current
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-v2-ink-soft">
                      {account.description || p.fallbackBlurb}
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-v2-ink-soft">You&apos;ll see: {p.sees}.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void openDemo(account)}
                  disabled={busy !== null || isCurrent}
                  className={cn(
                    "mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-v2-green px-4 py-2.5",
                    "text-[14.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  )}
                >
                  {busy === account.login
                    ? "Opening the demo…"
                    : isCurrent
                      ? "You're in this demo"
                      : current
                        ? "Switch to this demo"
                        : "Open demo"}
                  {busy !== account.login && !isCurrent && <ArrowRightIcon size={16} />}
                </button>
              </li>
            );
          })}
          {tenantHref && tenantDemo && (
            <li className="rounded-xl border border-dashed border-v2-line bg-white p-3.5">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-v2-lime-soft text-v2-green">
                  <BuildingIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold text-v2-navy">Organizations: try a demo company</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-v2-ink-soft">
                    An organization&apos;s accounts sign in on the company&apos;s own address, not here. Open{" "}
                    {tenantDemo.name}&apos;s sign-in and pick one of its demo members.
                  </p>
                </div>
              </div>
              <a
                href={tenantHref}
                className={cn(
                  "mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-v2-green px-4 py-2.5",
                  "text-[14.5px] font-bold text-v2-green transition-colors hover:bg-v2-lime-soft",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                )}
              >
                Go to {tenantDemo.name}
                <ArrowRightIcon size={16} />
              </a>
            </li>
          )}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-[13px] font-medium text-danger-text">
            {error}
          </p>
        )}
      </aside>
    </>
  );
}
