import type { ComponentType } from "react";
import Link from "next/link";
import { GlobeIcon, HeartIcon, ShieldCheckIcon, UsersIcon, type IconProps } from "@kiwiply/ui";
import NewsletterSignup from "@/components/NewsletterSignup";
import BrandLogo from "./BrandLogo";
import { BROWSER_TILES, FOOTER_COLUMNS, FOOTER_LEGAL, SOCIAL_LINKS } from "./nav";
import { FOOTER_TRUST, type FooterTrust } from "./placeholder-data";

const LINK_CLASS =
  "inline-flex min-h-7 items-center whitespace-nowrap text-[13px] text-white/70 transition-colors hover:text-white focus-visible:text-white";

const TRUST_ICONS: Record<FooterTrust["icon"], { Icon: ComponentType<IconProps>; ring: string }> = {
  shield: { Icon: ShieldCheckIcon, ring: "text-v2-lime" },
  users: { Icon: UsersIcon, ring: "text-v2-amber" },
  globe: { Icon: GlobeIcon, ring: "text-v2-amber" },
  heart: { Icon: HeartIcon, ring: "text-v2-lime" },
};

const TILE =
  "grid h-9 w-9 flex-none place-items-center border border-white/10 bg-white/10 text-[13px] font-extrabold text-white";

/**
 * Landing-v2 marketing footer (spec 13.3): navy-deep. Brand + blurb, four link columns (items with
 * no destination are text with a "Soon" chip), a right column with the newsletter on the dark
 * surface, the extension browsers and the socials; then the four-up trust row and the legal row.
 * The beta "as is" sentence stays as the last small line. Server component (NewsletterSignup is
 * its own client island).
 */
export default function MarketingFooter() {
  return (
    <footer className="mt-auto bg-v2-navy-deep text-white">
      <div className="mx-auto max-w-[1280px] px-5 pb-8 pt-14 lg:px-8 lg:pt-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-x-8 xl:grid-cols-[1fr_3.4fr_1.15fr]">
          {/* Brand */}
          <div className="flex max-w-xs flex-col gap-4">
            <Link href="/" aria-label="Kiwiply home" className="inline-flex w-fit items-center">
              <BrandLogo tone="dark" height={40} />
            </Link>
            <p className="font-[family-name:var(--font-hand)] text-[26px] leading-[1.05] text-white">
              More opportunities for a brighter you.
            </p>
            <p className="text-[13.5px] leading-relaxed text-white/70">
              Kiwiply helps you find the right jobs, autofill applications with AI, and keep track of
              everything — so you can spend less time on paperwork and more time on your future.
            </p>
          </div>

          {/* Link columns */}
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:order-last lg:col-span-2 xl:order-none xl:col-span-1">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.label}>
                <p className="text-[14px] font-bold text-white">{col.label}</p>
                <ul className="mt-3 flex flex-col">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      {item.soon ? (
                        <span className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap text-[13px] text-white/50">
                          {item.label}
                          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9.5px] font-semibold leading-none text-white/70">
                            Soon
                          </span>
                        </span>
                      ) : (
                        <Link href={item.href} className={LINK_CLASS}>
                          {item.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Newsletter, extension, socials */}
          <div id="newsletter" className="flex scroll-mt-24 flex-col gap-6">
            <div>
              <p className="text-[14px] font-bold text-white">Stay ahead with Kiwiply.</p>
              <p className="mb-3 mt-1 text-[13px] text-white/70">Get career insights, product updates, and more.</p>
              <NewsletterSignup tone="dark" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-white">Get the Kiwiply Extension</p>
              <p className="mb-3 mt-1 text-[13px] text-white/70">Works on LinkedIn + major ATS</p>
              <ul className="flex flex-wrap gap-2">
                {BROWSER_TILES.map((b) => (
                  <li key={b.label} className={`${TILE} rounded-lg`} title={b.label} style={{ color: b.color }}>
                    <span className="sr-only">{b.label}</span>
                    <span aria-hidden>{b.short}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 text-[14px] font-bold text-white">Follow Kiwiply</p>
              <ul className="flex flex-wrap gap-2">
                {SOCIAL_LINKS.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} aria-label={s.label} rel="noopener noreferrer" className={`${TILE} rounded-full transition-colors hover:bg-white/20`}>
                      {s.short}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Trust row */}
        <ul className="mt-12 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-white/10 pt-8 sm:grid-cols-2 xl:ml-[calc(1/5.55*100%)] xl:mr-[calc(1.15/5.55*100%)] lg:grid-cols-4">
          {FOOTER_TRUST.map((t) => {
            const { Icon, ring } = TRUST_ICONS[t.icon];
            return (
              <li key={t.title} className="flex items-start gap-3">
                <span aria-hidden className={`grid h-7 w-7 flex-none place-items-center rounded-full border border-current ${ring}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight text-white">{t.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-white/60">{t.body}</span>
                </span>
              </li>
            );
          })}
        </ul>

        {/* Bottom row */}
        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 text-[12.5px] text-white/60 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <p>© {new Date().getFullYear()} Kiwiply. All rights reserved.</p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {FOOTER_LEGAL.map((l, i) => (
              <li key={l.label} className="flex items-center gap-4">
                {i > 0 && <span aria-hidden className="hidden h-3 w-px bg-white/20 sm:block" />}
                <Link href={l.href} className="inline-flex min-h-7 items-center transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12.5px] font-semibold text-white/85">
            <GlobeIcon aria-hidden className="h-3.5 w-3.5" />
            English
          </span>
        </div>
        <p className="mt-5 max-w-3xl text-[11.5px] leading-relaxed text-white/45">
          Kiwiply is in <strong className="font-semibold text-white/60">beta</strong> — provided “as is” and “as
          available”; features may change while we improve it.
        </p>
      </div>
    </footer>
  );
}
