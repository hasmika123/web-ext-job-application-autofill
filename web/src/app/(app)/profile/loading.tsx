import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for the profile page while the bio streams in. */
export default function ProfileLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[210px_1fr]">
        <div className="hidden flex-col gap-1.5 lg:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[88px] rounded-[var(--radius-lg)]" />
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[62px]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
