import { Skeleton } from "@kiwiply/ui";

/** The editor while its document loads (DESIGN 10.10): the top bar, three canvas blocks and the rail. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading your resume" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-16 flex-none items-center gap-3 border-b border-line/60 bg-paper px-4">
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="h-5 w-36 rounded-lg" />
        <Skeleton className="ml-auto h-11 w-72 rounded-xl max-md:hidden" />
        <Skeleton className="h-11 w-28 rounded-xl" />
        <Skeleton className="h-11 w-11 rounded-xl" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl max-lg:hidden" />
      </div>
    </div>
  );
}
