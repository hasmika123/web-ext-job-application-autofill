import { ChevronLeftIcon, ChevronRightIcon, cn } from "@kiwiply/ui";

/** Page numbers with ellipses: 1 2 3 4 5 … 16 (always first, last and a window around `page`). */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [];
  if (page <= 4) {
    out.push(1, 2, 3, 4, 5, "…", pages);
  } else if (page >= pages - 3) {
    out.push(1, "…", pages - 4, pages - 3, pages - 2, pages - 1, pages);
  } else {
    out.push(1, "…", page - 1, page, page + 1, "…", pages);
  }
  return out;
}

/**
 * "Showing 1-8 of 124 …" + ‹ 1 2 3 4 5 … 16 ›. Presentational: pass `onPageChange` (from a client
 * parent) to make the buttons live; without it they render as inert controls.
 */
export default function Pagination({
  page,
  pages,
  summary,
  onPageChange,
  className,
}: {
  page: number;
  pages: number;
  summary: string;
  onPageChange?: (page: number) => void;
  className?: string;
}) {
  const go = (p: number) => onPageChange?.(Math.min(pages, Math.max(1, p)));
  const btn =
    "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-[13px] text-v2-muted">{summary}</p>
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)} className={cn(btn, "text-ink-soft hover:bg-paper-2")}>
          <ChevronLeftIcon size={15} />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} aria-hidden className="px-1 text-v2-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => go(p)}
              className={cn(btn, p === page ? "bg-v2-lime text-v2-navy" : "text-ink-soft hover:bg-paper-2")}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => go(page + 1)} className={cn(btn, "text-ink-soft hover:bg-paper-2")}>
          <ChevronRightIcon size={15} />
        </button>
      </nav>
    </div>
  );
}
