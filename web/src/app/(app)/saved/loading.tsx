import { ListSkeleton, Skeleton } from "@kiwiply/ui";

/** Loading fallback for Saved Jobs: the hero and list-shaped rows. */
export default function SavedLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <Skeleton className="h-[140px] rounded-[20px]" />
      <div className="flex flex-col gap-3 rounded-2xl border border-v2-line bg-white p-4">
        <Skeleton className="h-9 w-full max-w-md rounded-xl" />
        <ListSkeleton label="Loading your saved jobs" count={4} />
      </div>
    </div>
  );
}
