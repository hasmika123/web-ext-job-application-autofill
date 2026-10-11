import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for Job Search. */
export default function JobsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <Skeleton className="h-[190px] rounded-[20px]" />
      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
        <Skeleton className="hidden h-[640px] rounded-2xl xl:block" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
