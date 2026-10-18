import { ChevronLeftIcon, ChevronRightIcon, cn } from "@kiwiply/ui";

/** Page numbers with ellipses: 1 2 3 4 5 … 16 (always first, last and a window around `page`). */
function pageList(page: number, pages: number | undefined): (number | "…")[] {
  // Open-ended ("1 2 3 4 5 … ›"): no last page is known.
  if (pages === undefined) return [1, 2, 3, 4, 5, "…"];
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
 *
 * `tone="lime"` is the individual app (flat buttons, lime active page); `tone="blue"` is the org
 * admin (bordered buttons, blue-soft active page). Omit `pages` for the open-ended "1 2 3 4 5 … ›".
 */
export default function Pagination({
  page,
  pages,
  summary,
  onPageChange,
  tone = "lime",
  className,
}: {
  page: number;
  /** Last page number; omit for the open-ended shape. */
  pages?: number;
  summary: string;
  onPageChange?: (page: number) => void;
  tone?: "lime" | "blue";
  className?: string;
}) {
  const last = pages ?? Number.POSITIVE_INFINITY;
  const go = (p: number) => onPageChange?.(Math.min(last, Math.max(1, p)));
  const blue = tone === "blue";
  const btn = cn(
    "grid place-items-center rounded-lg text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40",
    blue ? "h-[30px] min-w-[30px] border px-1 font-medium" : "h-8 min-w-8 px-2 font-semibold",
  );
  const edge = blue ? "border-v2-line bg-paper text-ink-soft hover:bg-[#F4F7FD]" : "text-ink-soft hover:bg-paper-2";
  const on = blue ? "border-v2-blue bg-v2-blue-soft text-v2-blue" : "bg-v2-lime text-v2-navy";
  const off = blue ? "border-v2-line bg-paper text-ink-soft hover:bg-[#F4F7FD]" : "text-ink-soft hover:bg-paper-2";
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className={cn("text-v2-muted", blue ? "text-[12.5px]" : "text-[13px]")}>{summary}</p>
      <nav aria-label="Pagination" className={cn("flex items-center", blue ? "gap-1.5" : "gap-1")}>
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)} className={cn(btn, edge)}>
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
              className={cn(btn, p === page ? on : off)}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" disabled={page >= last} onClick={() => go(page + 1)} className={cn(btn, edge)}>
          <ChevronRightIcon size={15} />
        </button>
      </nav>
    </div>
  );
}
