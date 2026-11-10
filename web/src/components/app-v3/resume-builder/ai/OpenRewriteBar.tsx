"use client";

import { Button, SparklesIcon } from "@kiwiply/ui";
import type { AiProposal } from "@/lib/resume-ai";

/**
 * "You have an unreviewed AI rewrite" (R4.2): a proposal the server still holds open (the sheet was closed with
 * its ✕, or the page was refreshed) is offered again instead of being lost. Review opens it in the diff sheet;
 * Discard dismisses it. Nothing in the resume has changed until it is applied.
 */
export default function OpenRewriteBar({ proposal, onReview, onDiscard }: { proposal: AiProposal; onReview: () => void; onDiscard: () => void }) {
  const n = proposal.changes.length;
  return (
    <div role="region" aria-label="Unreviewed AI rewrite" data-open-rewrite className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-v2-line/70 bg-v2-violet-soft/40 px-4 py-2.5">
      <SparklesIcon aria-hidden className="h-4 w-4 flex-none text-v2-violet" />
      <p className="min-w-0 flex-1 text-[13.5px] text-ink">
        You have an unreviewed AI rewrite of {n} {n === 1 ? "line" : "lines"}. Nothing changes until you apply it.
      </p>
      <div className="flex flex-none items-center gap-2">
        <Button variant="accent" size="sm" onClick={onReview}>
          Review
        </Button>
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
