"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { GoogleIcon } from "@kiwiply/ui";

// The OAuth client id is NOT a secret (it's visible in every Google sign-in request), so
// it ships in the bundle as a default — overridable per-build via NEXT_PUBLIC_GOOGLE_CLIENT_ID
// (same pattern as the pinned extension id). Empty ⇒ the disabled "soon" stub.
const CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "482405713424-qtq3seoa0d8bg0e26f2bpisnqvjgt15o.apps.googleusercontent.com";

// Minimal typing for the slice of Google Identity Services we use (avoids `any`).
type GoogleId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

// GIS `initialize` is GLOBAL and warns if called more than once. Initialize it a single time
// and route the credential to whichever button is currently mounted via `activeHandler`
// (updated on each mount), so login↔signup tab switches don't re-initialize.
let gisInitialized = false;
let activeHandler: ((resp: { credential?: string }) => void) | null = null;

/** Only a same-site relative path is allowed as a post-login redirect (no open redirects). */
function safeNext(next?: string): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/**
 * "Sign in with Google" via Google Identity Services. Renders Google's official button,
 * receives the ID-token credential in the browser, and posts it to our BFF
 * (`/api/auth/google`) which verifies it and sets our session cookies — then we route on,
 * honoring `?next`. When no client id is configured this falls back to a disabled stub so
 * the layout (with its "or" divider) still reads correctly.
 */
export default function GoogleSignIn({ next }: { next?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let cancelled = false;
    const host = ref.current;

    // This mount's credential handler (captures the current `next`/router/setError).
    activeHandler = (resp) => {
      if (cancelled || !resp || !resp.credential) return;
      void (async () => {
        try {
          const r = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ credential: resp.credential }),
          });
          if (cancelled) return;
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            setError(d.error ?? "Google sign-in failed. Please try again.");
            return;
          }
          router.push(safeNext(next) ?? "/dashboard");
          router.refresh();
        } catch {
          if (!cancelled) setError("Network error during sign-in.");
        }
      })();
    };

    const init = () => {
      if (cancelled || !window.google || !host) return;
      if (!gisInitialized) {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => activeHandler?.(resp),
        });
        gisInitialized = true;
      }
      host.innerHTML = "";
      window.google.accounts.id.renderButton(host, { theme: "outline", size: "large", text: "continue_with", shape: "pill", width: 360 });
    };

    if (window.google) {
      init();
    } else {
      let s = document.getElementById("gsi-client") as HTMLScriptElement | null;
      if (!s) {
        s = document.createElement("script");
        s.id = "gsi-client";
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", init);
    }
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  if (!CLIENT_ID) {
    return (
      <button type="button" disabled title="Coming soon" className={cn(buttonVariants("ghost"), "w-full cursor-not-allowed gap-2.5 opacity-70")}>
        <GoogleIcon size={18} /> Continue with Google
        <span className="text-xs font-normal text-muted">soon</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} className="flex min-h-[40px] w-full justify-center" />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
