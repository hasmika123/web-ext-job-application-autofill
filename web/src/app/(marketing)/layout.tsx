import Link from "next/link";
import { Logo, BetaBadge } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import NewsletterSignup from "@/components/NewsletterSignup";

/**
 * Marketing shell for public pages (`/` and `/privacy`). Sticky branded header +
 * footer; no session gate. Authed app routes use `(app)`. Pricing lives on the
 * landing page's `#pricing` section — there is no standalone pricing route.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
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
            <Link href="/login" className={buttonVariants("ghost", "sm")}>
              Sign in
            </Link>
            <Link href="/signup" className={buttonVariants("accent", "sm")}>
              Get started
            </Link>
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
