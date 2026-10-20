"use client";

import { useEffect, useRef, useState } from "react";
import { AlertIcon, CheckIcon } from "@kiwiply/ui";
import TenantLogo from "@/components/ent/login/TenantLogo";
import { AUTH_CARD_COLUMN, LoginBackdrop } from "@/components/ent/login/AuthBackdrop";
import { connectFromTenant, type TenantConnectResult } from "@/lib/ent/tenant-connect";
import { EXT_ID } from "@/lib/extension-signal";

type ChromeRuntime = { sendMessage?: (extId: string, msg: unknown, cb?: (resp: unknown) => void) => void; lastError?: { message?: string } };

/**
 * The organization's own connect page (`/connect` on its host): opened by the account menu's Connect extension and by the extension's
 * "Sign in" button. Signed-out visitors reach it after the organization's sign-in (the proxy sends them there and back). It names only the
 * organization: the hand-off itself is `lib/ent/tenant-connect.ts`.
 */
export default function TenantConnect({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [result, setResult] = useState<TenantConnectResult | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React may run the effect twice in development: one code, one hand-off
    started.current = true;
    const runtime = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
    void connectFromTenant({ runtime, extId: EXT_ID, forward: (url) => window.location.replace(url) }).then(setResult);
  }, []);

  const status = result?.status ?? "working";
  return (
    <main className="tenant-sky relative isolate min-h-dvh overflow-x-hidden text-[var(--brand-900)]" data-tenant-connect data-status={status}>
      <LoginBackdrop />
      <div className={`mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col items-center justify-center px-4 py-10 ${AUTH_CARD_COLUMN}`}>
        <section aria-label="Connect the browser extension" className="tenant-glass w-full max-w-[520px] rounded-[28px] px-5 py-7 sm:px-9 sm:py-9">
          <div className="mb-5 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-body text-[28px] font-extrabold leading-tight tracking-tight">
                {status === "connected" ? "Extension connected" : status === "error" || status === "no-extension" ? "Couldn't connect" : "Connecting the extension…"}
              </h1>
            </div>
            <span aria-hidden className="h-16 w-px shrink-0 bg-[var(--brand-border)]" />
            <div className="grid h-[68px] w-[92px] shrink-0 place-items-center rounded-2xl p-2">
              <TenantLogo name={name} logoUrl={logoUrl} size="slot" />
            </div>
          </div>
          {status === "working" || status === "forwarded" ? (
            <p className="flex items-center gap-3 text-[15px] leading-snug text-[var(--brand-800)]">
              <span aria-hidden className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-600)]" />
              Signing the extension in to your {name} account.
            </p>
          ) : null}
          {status === "connected" ? (
            <p className="flex items-start gap-3 text-[15px] leading-snug text-[var(--brand-800)]" role="status">
              <CheckIcon size={20} className="mt-0.5 shrink-0" aria-hidden />
              You&apos;re all set: the extension is signed in to your {name} account. You can close this tab.
            </p>
          ) : null}
          {result && (result.status === "error" || result.status === "no-extension") ? (
            <div className="text-[15px] leading-snug text-[var(--brand-800)]" role="status">
              <p className="flex items-start gap-3">
                <AlertIcon size={20} className="mt-0.5 shrink-0" aria-hidden />
                {result.status === "no-extension"
                  ? "The extension didn't answer. Make sure it is installed and turned on in this browser, then try again."
                  : result.message}
              </p>
              <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-full bg-[var(--brand-600)] px-5 py-2 text-[14px] font-semibold text-white" data-connect-retry>
                Try again
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
