"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

// Pinned extension id (derived from the manifest "key"). Stable for the unpacked/dev build
// and for the published item after its first Web Store upload. Override per-build with
// NEXT_PUBLIC_KIWIPLY_EXTENSION_ID if the Web Store ever assigns a different id.
// Only the DIRECT transport below needs it; Firefox's relay addresses its own extension.
const EXT_ID = process.env.NEXT_PUBLIC_KIWIPLY_EXTENSION_ID || "ejlamilajchikpbeipdkjljjgankbfii";

// Firefox relay protocol. Firefox implements neither `externally_connectable` nor web-page
// `runtime.sendMessage` (https://bugzil.la/1319168), so there the extension injects a content
// script on this origin and we hand the session over by posting it to ourselves. See
// job-autofill/entrypoints/connect-relay.content.ts — these names must match.
const PING = "KIWIPLY_CONNECT_PING";
const PONG = "KIWIPLY_CONNECT_PONG";
const HANDOFF = "KIWIPLY_CONNECT";
const RESULT = "KIWIPLY_CONNECT_RESULT";
/** How long to wait for the relay to answer. Local postMessage, so this is generous. */
const RELAY_TIMEOUT_MS = 2000;

/** Resolves true if a connect relay is listening on this page (i.e. Firefox + extension installed). */
function pingRelay(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (found: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(found);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source === window && e.origin === window.location.origin && e.data?.type === PONG) finish(true);
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => finish(false), RELAY_TIMEOUT_MS);
    window.postMessage({ type: PING }, window.location.origin);
  });
}

/** Hands `tokens` to the relay and resolves with the extension's answer. */
function sendViaRelay(tokens: unknown): Promise<{ ok?: boolean; reason?: string } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: { ok?: boolean; reason?: string } | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      if (e.data?.type === RESULT) finish(e.data.result ?? null);
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => finish(null), RELAY_TIMEOUT_MS);
    window.postMessage({ type: HANDOFF, tokens }, window.location.origin);
  });
}

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
      // Pick a transport first, so we don't mint a session pair that nothing will collect.
      // Chrome/Edge: message the extension directly. Firefox: talk to the injected relay.
      const direct = !!chromeApi?.runtime?.sendMessage;
      if (direct && !EXT_ID) {
        setStatus("not-configured");
        return;
      }
      if (!direct && !(await pingRelay())) {
        if (cancelled) return;
        setStatus("no-extension");
        return;
      }
      if (cancelled) return;

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

      if (direct) {
        chromeApi!.runtime!.sendMessage!(EXT_ID, { type: HANDOFF, tokens }, () => {
          if (cancelled) return;
          const err = chromeApi?.runtime?.lastError;
          if (err) {
            setStatus("no-extension");
            setDetail(err.message ?? "");
            return;
          }
          setStatus("connected");
        });
        return;
      }

      const result = await sendViaRelay(tokens);
      if (cancelled) return;
      if (!result) {
        // The relay answered the ping but not the handoff — usually the extension was
        // reloaded or updated in between.
        setStatus("no-extension");
        setDetail("The extension stopped responding. Reload this page and try again.");
        return;
      }
      if (!result.ok) {
        setStatus("error");
        setDetail(result.reason || "The extension refused the session.");
        return;
      }
      setStatus("connected");
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
