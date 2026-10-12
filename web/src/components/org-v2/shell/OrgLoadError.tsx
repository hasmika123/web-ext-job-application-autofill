"use client";

import { useRouter } from "next/navigation";
import { ErrorState } from "@kiwiply/ui";

/**
 * Shown by the org layout when the memberships call fails (API down, 5xx): a calm "couldn't load" with Retry, never a
 * guess at a redirect. Retry re-runs the server layout.
 */
export default function OrgLoadError() {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-1 items-center px-4">
      <ErrorState what="your workspace" description="We couldn't reach the server. Your data is safe." onRetry={() => router.refresh()} className="w-full" />
    </div>
  );
}
