import Link from "next/link";
import { Logo, BetaBadge } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import NewsletterSignup from "@/components/NewsletterSignup";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";

type MarketingAccount = { login?: string; email?: string; firstName?: string; lastName?: string };

function initialFor(a?: MarketingAccount | null): string {
  const src = a?.firstName || a?.login || a?.email || "?";
  return src.charAt(0).toUpperCase();
}

/**
 * Marketing shell for public pages (`/`, `/privacy`, `/terms`). Sticky branded header +
 * footer; no session gate. When the visitor is already signed in, the header swaps the
 * Sign in / Get started buttons for a Dashboard button + an account avatar (→ Settings),
 * so the logo can safely bring signed-in users back here. Authed app routes use `(app)`.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const authed = await hasSession();
  let account: MarketingAccount | null = null;
  if (authed) {
    try {
      const res = await serverApiFetch("/api/account");
      if (res.ok) account = (await res.json().catch(() => null)) as MarketingAccount | null;
    } catch {
      /* stale/expired cookie — still show Dashboard, just without an initial */
    }
  }
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="Kiwiply" className="flex items-center gap-2">
            <Logo height={30} />
            <BetaBadge />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-soft sm:flex">
            <Link href="/#how" className="hover:text-ink">How it works</Link>
            <Link href="/#features" className="hover:text-ink">Features</Link>
            <Link href="/#pricing" className="hover:text-ink">Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            {authed ? (
              <>
                <Link href="/dashboard" className={buttonVariants("accent", "sm")}>
                  Dashboard
                </Link>
                <Link
                  href="/settings"
                  aria-label="Account settings"
                  title="Account settings"
                  className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent text-[13px] font-bold text-on-accent transition-transform hover:scale-105"
                >
                  {initialFor(account)}
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className={buttonVariants("ghost", "sm")}>
                  Sign in
                </Link>
                <Link href="/signup" className={buttonVariants("accent", "sm")}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-auto border-t border-line bg-paper-2">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-3">
              <Link href="/" aria-label="Kiwiply" className="flex items-center gap-2">
                <Logo height={24} />
                <BetaBadge />
              </Link>
              <nav className="flex flex-wrap gap-x-5 gap-y-2">
                <Link href="/privacy" className="hover:text-ink">Privacy</Link>
                <Link href="/terms" className="hover:text-ink">Terms</Link>
                <Link href="/#pricing" className="hover:text-ink">Pricing</Link>
              </nav>
              <p className="text-[12.5px] leading-relaxed">
                © {new Date().getFullYear()} Kiwiply · In{" "}
                <strong className="font-semibold text-ink-soft">beta</strong> — provided “as is” and
                “as available”; features may change while we improve it.
              </p>
            </div>
            <div id="newsletter" className="w-full max-w-sm scroll-mt-24">
              <NewsletterSignup />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
