import Link from "next/link";
import { ErrorState } from "@kiwiply/ui";

/** A server-rendered page of the plan builder could not read its data: the kit error card with a way back (a reload retries). */
export default function PlanLoadError({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-[900px] space-y-3">
      <ErrorState what={what} description="Reload the page to try again." />
      <Link href="/admin/pricing/plans" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-v2-blue-ink hover:underline">
        Back to the plans
      </Link>
    </div>
  );
}
