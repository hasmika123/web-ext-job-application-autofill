import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for the Dashboard while applications / matches / profile stream in. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <Skeleton className="h-[140px] rounded-[20px]" />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
