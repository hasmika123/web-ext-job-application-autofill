import Skeleton from "@/components/ui/Skeleton";

/**
 * Loading fallback for the board while applications stream in — mirrors the
 * attention-first layout: Saved shelf, collapsed Draft tray, 3-column pipeline,
 * collapsed Rejected list.
 */
export default function BoardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-4 h-9 w-72 rounded-full" />
        <div className="flex flex-col gap-3.5">
          {/* Saved shelf */}
          <div className="rounded-[var(--radius-lg)] bg-paper-2 p-3">
            <Skeleton className="mb-3 h-4 w-24" />
            <div className="flex gap-2.5 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-[300px] shrink-0 rounded-[var(--radius)]" />
              ))}
            </div>
          </div>
          {/* Draft tray (collapsed) */}
          <div className="rounded-[var(--radius-lg)] bg-paper-2 p-3">
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Active pipeline */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[440px] rounded-[var(--radius-lg)] bg-paper-2 p-3">
                <Skeleton className="mb-3 h-4 w-24" />
                <div className="flex flex-col gap-2.5">
                  {Array.from({ length: i === 0 ? 3 : 2 }).map((_, j) => (
                    <Skeleton key={j} className="h-24 rounded-[var(--radius)]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Rejected list (collapsed) */}
          <div className="rounded-[var(--radius-lg)] bg-paper-2 p-3">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
