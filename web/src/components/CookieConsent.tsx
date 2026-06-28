"use client";

import Link from "next/link";
import Script from "next/script";
import { useSyncExternalStore } from "react";
import { GA_MEASUREMENT_ID, analyticsEnabled } from "@/lib/analytics";

/**
 * GDPR/CCPA cookie consent for the website.
 *
 * We only set ONE category of non-essential cookies: Google Analytics. The httpOnly auth
 * cookies are strictly necessary (sign-in) and need no consent. So this component:
 *   - renders NOTHING at all when analytics isn't configured/enabled (no non-essential
 *     cookies → no banner, nothing to consent to);
 *   - otherwise shows a banner with equally-weighted Accept / Decline (reject must be as
 *     easy as accept), persisting the choice in localStorage; and
 *   - loads gtag.js ONLY after the visitor accepts (prior consent — scripts never load
 *     before a choice, and never if declined).
 *
 * The choice lives in localStorage and is read via useSyncExternalStore so it survives
 * reloads, stays in sync across tabs, and hydrates without a mismatch (the server snapshot
 * is always null → "undecided", matching first client paint). Replaces the old always-on
 * <Analytics />. The measurement ID is public by design.
 */
const STORAGE_KEY = "kiwiply_cookie_consent"; // "granted" | "denied"

type Choice = "granted" | "denied";

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb); // sync across tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readConsent(): Choice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null; // private mode / blocked storage → treat as undecided
  }
}

// Server (and first hydration paint) has no choice yet.
function serverConsent(): Choice | null {
  return null;
}

function setConsent(next: Choice): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore — listeners below still update this tab for the session */
  }
  listeners.forEach((l) => l());
}

export default function CookieConsent() {
  const choice = useSyncExternalStore(subscribe, readConsent, serverConsent);

  // Analytics off entirely → nothing to consent to.
  if (!analyticsEnabled()) return null;

  return (
    <>
      {choice === "granted" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
          </Script>
        </>
      )}

      {choice === null && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow)] sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <p className="flex-1 text-[13px] leading-relaxed text-ink-soft">
              We use a few analytics cookies to understand how Kiwiply is used so we can improve it.
              They&apos;re optional — the essential cookies that keep you signed in are always on. See
              our{" "}
              <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setConsent("denied")}
                className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => setConsent("granted")}
                className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:brightness-95"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
