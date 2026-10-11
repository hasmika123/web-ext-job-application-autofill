import Link from "next/link";
import { GlobeIcon } from "@kiwiply/ui";
import NewsletterSignup from "@/components/NewsletterSignup";
import BrandLogo from "../BrandLogo";
import { FOOTER_COLUMNS, FOOTER_LEGAL, SOCIAL_LINKS } from "../nav";
import V3FooterColumns from "./V3FooterColumns";

/**
 * Landing-v3 dark footer (phone board): logo, handwritten tagline, blurb, round social tiles,
 * accordion link columns, "Stay ahead with Kiwiply" + newsletter, the four legal links, copyright
 * and the language chip. Link data is the shared `nav.ts` (same destinations as the v2 footer).
 * From lg: brand left, columns open on the right. The beta "as is" line from the shared footer is
 * kept as the last small line.
 */
const SOCIAL_ORDER = ["LinkedIn", "Instagram", "YouTube", "TikTok", "X"];
const SOCIALS = SOCIAL_ORDER.map((l) => SOCIAL_LINKS.find((s) => s.label === l)).filter(
  (s): s is (typeof SOCIAL_LINKS)[number] => Boolean(s),
);

/** The phone board shows exactly four legal links; the long list stays on the v2 footer. */
const LEGAL = FOOTER_LEGAL.filter((l) => ["Privacy", "Terms", "Cookies", "Accessibility"].includes(l.label));

export default function V3Footer() {
  return (
    <footer data-v3-footer className="relative overflow-hidden bg-[#0B2A24] text-white">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_100%_0%,rgba(132,227,61,.16),transparent_45%),radial-gradient(ellipse_at_0%_100%,rgba(95,191,31,.14),transparent_45%)]"
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-8 pt-12 lg:px-8 lg:pt-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-14">
          <div className="flex flex-col gap-4">
            <Link href="/v3" aria-label="Kiwiply home" className="inline-flex w-fit items-center">
              <BrandLogo tone="dark" height={40} />
            </Link>
            <p className="font-[family-name:var(--font-hand)] text-[28px] leading-[1.05] text-white">
              More opportunities
              <br />
              for a brighter you.
            </p>
            <p className="text-[13.5px] leading-relaxed text-white/70">
              Kiwiply helps you find the right jobs, autofill applications with AI, and keep track of everything — so
              you can spend less time on paperwork and more time on your future.
            </p>
            <ul className="mt-1 flex flex-wrap gap-2.5">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    rel="noopener noreferrer"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 text-[13px] font-extrabold text-white transition-colors hover:bg-white/20"
                  >
                    {s.short}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <V3FooterColumns groups={FOOTER_COLUMNS} />
        </div>

        <div id="newsletter" className="mt-10 grid scroll-mt-24 gap-3 lg:max-w-md">
          <p className="text-[16px] font-bold text-white">
            Stay ahead with <span className="text-v2-lime">Kiwiply</span>
          </p>
          <p className="-mt-1 text-[13.5px] text-white/70">
            Get the latest job search tips, product updates and new features.
          </p>
          <NewsletterSignup tone="dark" />
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 text-[12.5px] text-white/60 lg:flex-row lg:items-center lg:justify-between">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {LEGAL.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="inline-flex min-h-7 items-center transition-colors hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p>© {new Date().getFullYear()} Kiwiply. All rights reserved.</p>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 font-semibold text-white/85">
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
