import { cn } from "./cn";
import Skeleton from "./Skeleton";

/**
 * Page-shaped loading placeholders (the page kit, E2E-U0.0): compositions of `Skeleton` so every page paints the
 * shape of what is coming instead of a spinner. Show them on the FIRST load only; a refetch keeps the old data on
 * screen (APP-E2E-PLAN section 7.6). Each is a `role="status"` region with an accessible "Loading" label.
 */
export interface ListSkeletonProps {
  /** How many rows / tiles (default 5 / 4). */
  count?: number;
  /** Accessible name; default "Loading". */
  label?: string;
  className?: string;
}

/** A vertical list of rows: an avatar-ish block, two text lines and a trailing chip. */
export function ListSkeleton({ count = 5, label = "Loading", className }: ListSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} data-skeleton="list" className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3">
          <Skeleton className="h-10 w-10 flex-none rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 flex-none rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A row of stat tiles (a number over a caption). */
export function TileSkeleton({ count = 4, label = "Loading", className }: ListSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-skeleton="tiles"
      className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2.5 rounded-[var(--radius-lg)] border border-line bg-paper p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export interface TableSkeletonProps extends ListSkeletonProps {
  /** Column count (default 5). */
  columns?: number;
}

/** A header band plus rows of cells. */
export function TableSkeleton({ count = 6, columns = 5, label = "Loading", className }: TableSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-skeleton="table"
      className={cn("overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper", className)}
    >
      <div className="flex gap-4 border-b border-line bg-paper-2 px-4 py-3">
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: count }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "flex-[1.5]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default ListSkeleton;
