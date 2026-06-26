"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

// Pinned extension id (manifest "key") — set NEXT_PUBLIC_KIWIPLY_EXTENSION_ID at build time.
const EXT_ID = process.env.NEXT_PUBLIC_KIWIPLY_EXTENSION_ID;

type ChromeRuntime = {
  sendMessage?: (extId: string, msg: unknown, cb?: (resp: unknown) => void) => void;
  lastError?: { message?: string };
};
type Status = "working" | "connected" | "signed-out" | "no-extension" | "error" | "not-configured";

/**
 * Extension connect handoff. The extension opens this page; once you're signed in we mint a
 * separate extension token pair (`/api/extension/token`) and pass it to the extension via
 * `chrome.runtime.sendMessage` (externally_connectable). No second login.
 *
 * This page is intentionally NOT in the `(app)` group: a logged-out visitor isn't bounced to
 * the dashboard — instead they see a sign-in prompt that returns here (`?next=/connect`), so a
 * fresh install connects in one hop after signing in.
 */
export default function ConnectPage() {
  const [status, setStatus] = useState<Status>("working");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;
    const chromeApi = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;

    (async () => {
      if (!EXT_ID) {
        setStatus("not-configured");
        return;
      }
      if (!chromeApi?.runtime?.sendMessage) {
        setStatus("no-extension");
        return;
      }
      let tokens: unknown;
      try {
        const res = await fetch("/api/extension/token", { credentials: "include", cache: "no-store" });
        if (res.status === 401) {
          setStatus("signed-out");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          setDetail("Couldn't create an extension session. Try again.");
          return;
        }
        tokens = await res.json();
      } catch {
        setStatus("error");
        setDetail("Network error reaching the server.");
        return;
      }
      if (cancelled) return;

      chromeApi.runtime.sendMessage(EXT_ID, { type: "KIWIPLY_CONNECT", tokens }, () => {
        if (cancelled) return;
        const err = chromeApi.runtime?.lastError;
        if (err) {
          setStatus("no-extension");
          setDetail(err.message ?? "");
          return;
        }
        setStatus("connected");
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-full rounded-[var(--radius-lg)] border border-line bg-paper p-8 shadow-[var(--shadow)]">
        {status === "working" && (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />
            <h1 className="mt-5 font-display text-xl font-semibold text-ink">Connecting the extension…</h1>
            <p className="mt-2 text-sm text-muted">Handing your session to the Kiwiply extension.</p>
          </>
        )}

        {status === "connected" && (
          <>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent-deep">✓</div>
            <h1 className="mt-5 font-display text-xl font-semibold text-ink">Extension connected</h1>
            <p className="mt-2 text-sm text-muted">
              You&apos;re all set — the Kiwiply extension is now signed in. Manage your profile and resumes here on the web.
            </p>
            <Link href="/dashboard" className={buttonVariants("accent") + " mt-6"}>
              Go to your dashboard
            </Link>
          </>
        )}

        {status === "signed-out" && (
          <>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent-deep">→</div>
            <h1 className="mt-5 font-display text-xl font-semibold text-ink">Sign in to connect</h1>
            <p className="mt-2 text-sm text-muted">
              Sign in to your Kiwiply account and we&apos;ll connect the extension automatically.
            </p>
            <Link href="/login?next=/connect" className={buttonVariants("accent") + " mt-6"}>
              Sign in
            </Link>
            <p className="mt-3 text-xs text-muted">
              New here?{" "}
              <Link href="/signup?next=/connect" className="font-medium text-accent-deep hover:underline">
                Create an account
              </Link>
            </p>
          </>
        )}

        {status === "no-extension" && (
          <>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brown-soft text-brown-deep">!</div>
            <h1 className="mt-5 font-display text-xl font-semibold text-ink">Couldn&apos;t reach the extension</h1>
            <p className="mt-2 text-sm text-muted">
              Make sure the Kiwiply browser extension is installed and enabled, then open this page from the extension again.
            </p>
            {detail && <p className="mt-2 text-xs text-muted">{detail}</p>}
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brown-soft text-brown-deep">!</div>
            <h1 className="mt-5 font-display text-xl font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted">{detail || "Please try again."}</p>
          </>
        )}

        {status === "not-configured" && (
          <>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brown-soft text-brown-deep">!</div>
            <h1 className="mt-5 font-display text-xl font-semibold text-ink">Connect isn&apos;t configured yet</h1>
            <p className="mt-2 text-sm text-muted">
              The extension id isn&apos;t set for this build. (Set <code>NEXT_PUBLIC_KIWIPLY_EXTENSION_ID</code>.)
            </p>
          </>
        )}
      </div>
    </main>
  );
}
