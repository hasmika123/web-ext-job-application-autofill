import { ListSkeleton, Skeleton, TileSkeleton } from "@kiwiply/ui";

/** The dashboard's skeleton: the hero band, four tiles and a list, so nothing jumps when the numbers arrive. */
export default function OrgDashboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-36 w-full rounded-3xl" />
      <TileSkeleton label="Loading the dashboard" />
      <ListSkeleton count={3} label="Loading activity" />
    </div>
  );
}
