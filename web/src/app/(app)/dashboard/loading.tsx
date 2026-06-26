import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for the dashboard while applications/resumes/profile stream in. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-56" />
        </div>
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-[15px] lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-[var(--radius-lg)]" />
        ))}
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      </div>

      <Skeleton className="h-48 rounded-[var(--radius-lg)]" />
    </div>
  );
}
