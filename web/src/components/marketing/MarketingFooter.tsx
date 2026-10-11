import Link from "next/link";
import NewsletterSignup from "@/components/NewsletterSignup";
import BrandLogo from "./BrandLogo";
import { FOOTER_COLUMNS, SOCIAL_LINKS } from "./nav";

const LINK_CLASS =
  "inline-flex min-h-8 items-center text-[14.5px] text-white/70 transition-colors hover:text-white focus-visible:text-white";

/**
 * Landing-v2 marketing footer: navy-deep, brand lockup + blurb, four link columns, the
 * newsletter opt-in in a white card, and a bottom row with copyright, legal links and the
 * beta "as is" disclaimer. Server component (NewsletterSignup is its own client island).
 */
export default function MarketingFooter() {
  return (
    <footer className="mt-auto bg-v2-navy-deep text-white">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-14 lg:px-8 lg:pt-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_2.4fr_1.3fr] lg:gap-10">
          {/* Brand */}
          <div className="flex max-w-xs flex-col gap-4">
            <Link href="/" aria-label="Kiwiply home" className="inline-flex w-fit items-center">
              <BrandLogo tone="dark" height={32} />
            </Link>
            <p className="text-[15px] leading-relaxed text-white/70">
              One profile, one board, no auto-submit. Kiwiply fills your applications for you to
              review and keeps every reply in sight.
            </p>
            {SOCIAL_LINKS.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {SOCIAL_LINKS.map((s) => (
                  <li key={s.href}>
                    <a href={s.href} rel="noopener noreferrer" className={LINK_CLASS}>
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Link columns */}
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.label}>
                <p className="text-[13.5px] font-bold text-white">{col.label}</p>
                <ul className="mt-3 flex flex-col">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className={LINK_CLASS}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Newsletter */}
          <div id="newsletter" className="scroll-mt-24">
            <div className="rounded-[var(--radius-v2-card)] bg-white p-5 text-ink shadow-v2-float">
              <p className="mb-3 text-[15px] font-bold text-ink">Stay in the loop</p>
              <NewsletterSignup />
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-[13px] text-white/60 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <p className="max-w-2xl leading-relaxed">
            © {new Date().getFullYear()} Kiwiply · In{" "}
            <strong className="font-semibold text-white/80">beta</strong> — provided “as is” and
            “as available”; features may change while we improve it.
          </p>
          <ul className="flex flex-none flex-wrap gap-x-5 gap-y-1">
            {[
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
              { label: "Contact", href: "/contact" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-8 items-center transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
