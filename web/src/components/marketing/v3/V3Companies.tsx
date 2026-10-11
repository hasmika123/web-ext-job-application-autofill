import { cn } from "@kiwiply/ui";
import {
  V3_APP_TILES,
  V3_COMPANIES,
  V3_COMPANIES_LINE,
  V3_COMPANIES_MORE,
  type V3Company,
} from "./placeholder-data";

/**
 * Landing-v3 "Our users get hired at amazing companies" strip (desktop board) and the phone
 * board's row of job-site tiles. Marks are styled TEXT wordmarks / lettered tiles: no third-party
 * logo files ship. Data (names, colours) lives in `placeholder-data.ts`.
 */

const GOOGLE_LETTERS = ["#4285F4", "#EA4335", "#FBBC05", "#4285F4", "#34A853", "#EA4335"];

function Wordmark({ c }: { c: V3Company }) {
  switch (c.style) {
    case "google":
      return (
        <span className="text-[28px] font-medium tracking-[-0.02em]">
          {c.text.split("").map((ch, i) => (
            <span key={i} style={{ color: GOOGLE_LETTERS[i % GOOGLE_LETTERS.length] }}>
              {ch}
            </span>
          ))}
        </span>
      );
    case "microsoft":
      return (
        <span className="inline-flex items-center gap-2 text-[22px] font-medium tracking-normal" style={{ color: c.color }}>
          <span aria-hidden className="grid grid-cols-2 gap-[2px]">
            <i className="block h-[11px] w-[11px] bg-[#F25022]" />
            <i className="block h-[11px] w-[11px] bg-[#7FBA00]" />
            <i className="block h-[11px] w-[11px] bg-[#00A4EF]" />
            <i className="block h-[11px] w-[11px] bg-[#FFB900]" />
          </span>
          {c.text}
        </span>
      );
    case "amazon":
      return (
        <span className="relative inline-block pb-1 text-[26px] font-extrabold tracking-[-0.03em]" style={{ color: c.color }}>
          {c.text}
          <span aria-hidden className="absolute inset-x-1 bottom-0 h-[3px] rounded-b-full border-b-[3px] border-[#FF9900]" />
        </span>
      );
    case "stripe":
      return (
        <span className="text-[30px] font-extrabold italic tracking-[-0.04em]" style={{ color: c.color }}>
          {c.text}
        </span>
      );
    case "meta":
      return (
        <span className="inline-flex items-center gap-1 text-[26px] font-semibold tracking-[-0.02em]" style={{ color: c.color }}>
          <span aria-hidden className="text-[30px] leading-none">
            ∞
          </span>
          {c.text}
        </span>
      );
    case "apple":
      return (
        <span className="text-[24px] font-semibold tracking-[-0.02em]" style={{ color: c.color }}>
          {c.text}
        </span>
      );
    case "netflix":
      return (
        <span className="text-[28px] font-black uppercase tracking-[-0.04em]" style={{ color: c.color }}>
          {c.text}
        </span>
      );
  }
}

/** Desktop strip (md+). */
export function V3CompaniesStrip({ className }: { className?: string }) {
  return (
    <section aria-label="Where our users get hired" className={cn("hidden px-5 md:block lg:px-8", className)}>
      <div className="mx-auto flex max-w-[1440px] items-center gap-8 rounded-[20px] border border-v2-line/60 bg-white px-8 py-5 shadow-v2-card xl:gap-12">
        <p className="w-[170px] flex-none text-[14px] font-bold leading-snug text-v2-navy">{V3_COMPANIES_LINE}</p>
        <ul className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-8 gap-y-4">
          {V3_COMPANIES.map((c) => (
            <li key={c.name} aria-label={c.name} className="flex-none whitespace-nowrap leading-none">
              <Wordmark c={c} />
            </li>
          ))}
        </ul>
        <span className="hidden flex-none rounded-full bg-v2-blue-soft/70 px-5 py-2.5 text-[13px] text-v2-muted xl:block">
          {V3_COMPANIES_MORE}
        </span>
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
            {t.letter}
          </li>
        ))}
      </ul>
    </section>
  );
}
