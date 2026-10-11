import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for Job Search / Job detail. */
export default function JobsLoading() {
  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Skeleton className="h-[190px] rounded-[20px]" />
        <Skeleton className="h-[68px] rounded-2xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-2xl" />
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
    </div>
  );
}
