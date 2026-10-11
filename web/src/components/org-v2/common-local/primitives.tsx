import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * The two §2 primitives the shared `app-v2/common` set cannot cover for the org pages yet, kept
 * local with the SAME names/props plus the extras the org boards need (QA: fold the extras into
 * `common` and delete this file):
 *  - `PageHero` needs an `eyebrow` chip, a `decor` layer and a `note` placed to the RIGHT of the art.
 *  - `Pagination` needs the org's blue active page and a missing last page ("1 2 3 4 5 … ›").
 * Everything is HTML/CSS (no inline <svg>).
 */

/* ── Pagination ──────────────────────────────────────────────────────────────────── */
/** "Showing 1-8 of 124 …" + ‹ 1 2 3 4 5 … 16 ›. Presentational (the boards page sample rows). */
export function Pagination({
  page,
  pages,
  summary,
  className,
}: {
  page: number;
  /** Last page number; omit to render "1 2 3 4 5 … ›" with no final page. */
  pages?: number;
  summary: ReactNode;
  className?: string;
}) {
  const items: (number | "…")[] =
    pages !== undefined && pages <= 7
      ? Array.from({ length: pages }, (_, i) => i + 1)
      : [1, 2, 3, 4, 5, "…", ...(pages !== undefined ? [pages] : [])];
  const btn =
    "grid h-[30px] min-w-[30px] place-items-center rounded-lg border px-1 text-[13px] font-medium transition-colors";
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 pt-3.5", className)}>
      <p className="text-[12.5px] text-v2-ink-soft">{summary}</p>
      <nav aria-label="Pagination" className="flex items-center gap-1.5">
        <button type="button" aria-label="Previous page" className={cn(btn, "border-v2-line bg-white text-v2-muted")}>
          ‹
        </button>
        {items.map((it, i) =>
          it === "…" ? (
            <span key={`e${i}`} className="px-1 text-v2-muted">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              aria-label={`Page ${it}`}
              aria-current={it === page ? "page" : undefined}
              className={cn(
                btn,
                it === page
                  ? "border-v2-blue bg-v2-blue-soft text-v2-blue"
                  : "border-v2-line bg-white text-v2-ink-soft hover:bg-[#F4F7FD]",
              )}
            >
              {it}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" className={cn(btn, "border-v2-line bg-white text-v2-ink-soft")}>
          ›
        </button>
      </nav>
    </div>
  );
}

/* ── PageHero ────────────────────────────────────────────────────────────────────── */
export function PageHero({
  title,
  icon,
  subtitle,
  note,
  art,
  tone = "blue",
  eyebrow,
  actions,
  decor,
}: {
  title: string;
  /** Glyph rendered after the title (blue for org). */
  icon?: ReactNode;
  subtitle: ReactNode;
  /** Handwritten annotation (Caveat), rendered to the right of the art. */
  note?: ReactNode;
  /** Right-hand artwork. */
  art?: ReactNode;
  tone?: "lime" | "blue";
  /** Chip above the title (org: "Acme Corp Enterprise"). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Extra decorative layer (doodles). */
  decor?: ReactNode;
}) {
  const wash =
    tone === "blue"
      ? "bg-gradient-to-r from-[#E6EFFF] via-[#EEF4FF] to-[#E4F2FF]"
      : "bg-gradient-to-r from-[#EAF9DB] via-[#F2FBE8] to-[#E5F6EF]";
  const blob1 = tone === "blue" ? "bg-[#CFE0FF]" : "bg-[#D5F2B8]";
  return (
    <section className={cn("relative overflow-hidden rounded-[20px] border border-v2-line/70", wash)}>
      {/* pastel blobs */}
      <span aria-hidden className={cn("absolute -left-10 -top-16 h-44 w-44 rounded-full opacity-60 blur-2xl", blob1)} />
      <span aria-hidden className="absolute bottom-[-60px] left-1/3 h-40 w-56 rounded-full bg-[#D9F3E8] opacity-50 blur-2xl" />
      <span aria-hidden className="absolute -right-8 top-0 h-40 w-40 rounded-full bg-[#E2DAFF] opacity-60 blur-2xl" />
      {decor}
      <div className="relative z-[1] flex min-h-[150px] items-end justify-between gap-6 px-5 pb-5 pt-5 md:px-8 md:pb-6 md:pt-6">
        <div className="min-w-0 max-w-[640px] self-center">
          {eyebrow && <div className="mb-3">{eyebrow}</div>}
          <div className="flex items-center gap-3">
            <h1 className="text-[32px] text-v2-navy md:text-[40px]">{title}</h1>
            {icon && <span className="flex-none text-v2-blue">{icon}</span>}
          </div>
          <p className="mt-2 max-w-[560px] text-[14.5px] leading-snug text-v2-ink-soft md:text-[15.5px]">{subtitle}</p>
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {(art || note) && (
          <div className="hidden flex-none items-end self-stretch lg:flex">
            {art}
            {note && <div className="mb-auto ml-2 mr-4 mt-2 w-[150px] -rotate-6 self-start xl:w-[170px]">{note}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
