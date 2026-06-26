import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for the resumes page while the list streams in. */
export default function ResumesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      <Skeleton className="h-32 rounded-[var(--radius-lg)]" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </div>
  );
}
