import Link from "next/link";
import { LinkedInIcon, cn } from "@kiwiply/ui";
import { V3_APP_TILES } from "./placeholder-data";
import { PARTNERS_TRUST_LINE, ROADMAP_HREF } from "../partners-data";
import { TrustRows } from "../TrustStrip";

/**
 * Landing-v3 support strip (desktop): the same "Works today" / "On the roadmap" rows as the main
 * landing page's trust strip (`TrustRows`), on a white card. Phones get a row of lettered job-site
 * tiles (LinkedIn + the five ATS) and a link to the roadmap. No logo files ship; data lives in
 * `../partners-data.ts` and `placeholder-data.ts` and states real support only.
 */

/** Desktop strip (md+). */
export function V3CompaniesStrip({ className }: { className?: string }) {
  return (
    <section aria-label="Where Kiwiply works" className={cn("hidden px-5 md:block lg:px-8", className)}>
      <div className="mx-auto max-w-[1440px] rounded-[20px] border border-v2-line/60 bg-white px-8 py-6 shadow-v2-card">
        <p className="mb-5 text-center text-[14px] font-bold text-v2-navy">{PARTNERS_TRUST_LINE}</p>
        <TrustRows />
      </div>
    </section>
  );
}

/** Phone row of job-site tiles (< md). */
export function V3AppTiles() {
  return (
    <section aria-label="Job sites Kiwiply works on" className="px-5 pb-6 md:hidden">
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-3">
        {V3_APP_TILES.map((t) => (
          <li
            key={t.name}
            aria-label={t.name}
            className="grid h-14 w-14 place-items-center rounded-2xl border border-v2-line/60 text-[22px] font-extrabold shadow-v2-card"
            style={{ color: t.color, background: t.bg }}
          >
            {t.icon === "linkedin" ? <LinkedInIcon size={30} /> : t.letter}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-[13px] text-v2-ink-soft">
        Works today. More sites on the way.{" "}
        <Link href={ROADMAP_HREF} className="font-semibold text-v2-blue hover:underline">
          See what&rsquo;s next &rarr;
        </Link>
      </p>
    </section>
  );
}
