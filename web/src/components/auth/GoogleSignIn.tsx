"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

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

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
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
        <GoogleG /> Continue with Google
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
