"use client";

import { usePathname } from "next/navigation";

/** Routes under the marketing group that bring their own header + footer (landing v3). */
const OWN_CHROME = ["/v3"];

/**
 * Renders the shared marketing header / footer except on routes that ship their own chrome.
 * The `(marketing)` layout wraps `MarketingHeader` / `MarketingFooter` in this, so a page like
 * `/v3` swaps the chrome by route instead of hiding it with injected CSS. `/` and every other
 * marketing page are unaffected.
 */
export default function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (OWN_CHROME.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return <>{children}</>;
}
