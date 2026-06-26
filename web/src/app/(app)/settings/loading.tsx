import Skeleton from "@/components/ui/Skeleton";

/** Loading fallback for settings while the account streams in. */
export default function SettingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[190px_1fr]">
        <div className="hidden flex-col gap-1.5 lg:flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
        <div className="flex flex-col gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
