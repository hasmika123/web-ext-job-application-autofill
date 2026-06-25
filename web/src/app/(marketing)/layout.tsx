import Link from "next/link";
import { Logo } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";

/**
 * Marketing shell for public pages (`/`, `/privacy`, and `/pricing` once it lands).
 * Sticky branded header + footer; no session gate. Authed app routes use `(app)`.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="Kiwiply">
            <Logo height={28} />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-soft sm:flex">
            <Link href="/#how" className="hover:text-ink">How it works</Link>
            <Link href="/#features" className="hover:text-ink">Features</Link>
            <Link href="/pricing" className="hover:text-ink">Pricing</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted">
          <Logo height={22} />
          <nav className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/pricing" className="hover:text-ink">Pricing</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
          <span>© {new Date().getFullYear()} Kiwiply</span>
        </div>
      </footer>
    </div>
  );
}
