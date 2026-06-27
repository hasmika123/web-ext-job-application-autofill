"use client";

import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/Button";

/** Same-site-only guard (mirrors AuthScreen) — no open redirects. */
function safeNext(next?: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/**
 * "Go to sign in" CTA on the activation page. If signup stashed a post-auth target
 * (e.g. `/connect`) in localStorage, carry it through as `?next=` so a brand-new user
 * lands back there after activating + signing in. Read at click time (no effect/SSR
 * concerns). Best-effort: only when activation happens in the same browser as signup.
 */
export default function ActivateSignInLink({
  variant,
  label,
}: {
  variant: "accent" | "primary";
  label: string;
}) {
  const router = useRouter();

  function go() {
    let target = "/login";
    try {
      const n = safeNext(localStorage.getItem("kiwiply_next"));
      if (n) {
        target = `/login?next=${encodeURIComponent(n)}`;
        localStorage.removeItem("kiwiply_next"); // consume once
      }
    } catch {
      /* ignore */
    }
    router.push(target);
  }

  return (
    <button type="button" onClick={go} className={buttonVariants(variant)}>
      {label}
    </button>
  );
}
