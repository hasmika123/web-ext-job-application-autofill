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
type Status = "working" | "connected" | "no-extension" | "error" | "not-configured";

/**
 * Extension connect handoff (R-ext): the extension opens this page; once you're signed in
 * we mint a separate extension token pair (`/api/extension/token`) and pass it to the
 * extension via `chrome.runtime.sendMessage` (externally_connectable). No second login.
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
        if (!res.ok) {
          setStatus("error");
          setDetail("Couldn't create an extension session. Try signing in again.");
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center py-16 text-center">
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
