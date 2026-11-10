import { Skeleton, TableSkeleton } from "@kiwiply/ui";

/** Loading fallback for My Applications: the hero, the tabs and a table-shaped placeholder. */
export default function ApplicationsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <Skeleton className="h-[140px] rounded-[20px]" />
      <div className="flex flex-col gap-3 rounded-2xl border border-v2-line bg-white p-4">
        <Skeleton className="h-9 w-full max-w-md rounded-xl" />
        <TableSkeleton label="Loading your applications" columns={4} />
      </div>
    </div>
  );
}
