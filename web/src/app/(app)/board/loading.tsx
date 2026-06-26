import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for the board while applications stream in. */
export default function BoardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div>
        <Skeleton className="mb-4 h-9 w-72 rounded-full" />
        <div className="flex gap-3.5 overflow-x-auto pb-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="min-h-[320px] w-[200px] shrink-0 rounded-[var(--radius-lg)] bg-paper-2 p-3">
              <Skeleton className="mb-3 h-4 w-24" />
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: i % 2 === 0 ? 2 : 1 }).map((_, j) => (
                  <Skeleton key={j} className="h-20 rounded-[var(--radius)]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
