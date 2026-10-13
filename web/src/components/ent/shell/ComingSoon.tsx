import { EmptyState } from "@kiwiply/ui";
import PageHeader, { ClaimsMascot } from "./ShellContext";

/** A menu page that is not built yet: friendly, with the bee, never a 404. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div data-coming-soon className="mx-auto max-w-xl pt-6">
      <PageHeader title={title} subtitle="This page is on the way." />
      <ClaimsMascot />
      <EmptyState
        mascotPose="thinking"
        title="This page is on the way"
        description={`${title} isn't ready yet. Everything else in your menu works, and we'll let you know when this one opens.`}
      />
    </div>
  );
}
