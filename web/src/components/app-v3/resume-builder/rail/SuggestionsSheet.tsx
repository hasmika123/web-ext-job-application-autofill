"use client";

import type { RefObject } from "react";
import { AiDisclosure, Button, SideSheet, SparklesIcon, Spinner } from "@kiwiply/ui";
import { COPY, suggestionNeedsReview, type AiProposal } from "@/lib/resume-ai";
import SuggestionCard from "./SuggestionCard";

// config-literal-ok: side-sheet width is layout geometry (DESIGN 13.3), not a tunable
const SHEET_WIDTH = 480;

export interface SuggestionsSheetProps {
  open: boolean;
  phone: boolean;
  cards: AiProposal[];
  stale: boolean;
  asking: boolean;
  applyingId: number | null;
  busy: boolean;
  onApply: (proposal: AiProposal) => void;
  onPreview: (proposal: AiProposal, returnTo: HTMLElement | null) => void;
  onRefresh: () => void;
  onClose: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * "See all" (DESIGN 10.7): every open suggestion card in one list, each with the same Apply Suggestion / Preview
 * buttons as the carousel, and a Refresh when they were made from an earlier version of the resume.
 */
export default function SuggestionsSheet({ open, phone, cards, stale, asking, applyingId, busy, onApply, onPreview, onRefresh, onClose, returnFocusTo }: SuggestionsSheetProps) {
  return (
    <SideSheet
      id="rb-suggestions-sheet"
      side="right"
      mode={phone ? "fullscreen" : "overlay"}
      open={open}
      width={SHEET_WIDTH}
      title="AI Suggestions"
      description={cards.length === 1 ? "1 suggestion" : `${cards.length} suggestions`}
      icon={<SparklesIcon className="h-5 w-5" />}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {stale && (
            <Button variant="accent" size="sm" disabled={asking} onClick={onRefresh} className="ml-auto">
              {asking && <Spinner role="presentation" aria-hidden className="h-4 w-4" />}
              {asking ? "Refreshing…" : "Refresh"}
            </Button>
          )}
        </>
      }
    >
      {stale && (
        <p role="status" className="mb-3 rounded-lg bg-[color-mix(in_srgb,var(--color-warn)_14%,transparent)] px-3 py-2 text-[12.5px] text-ink">
          <span className="font-semibold">{COPY.suggestStale}.</span> <span className="text-ink-soft">{COPY.suggestStaleBody}</span>
        </p>
      )}
      <ul role="list" aria-label="All suggestions" aria-busy={busy} className="flex flex-col gap-3">
        {cards.map((c) => (
          <li key={c.id}>
            <SuggestionCard
              proposal={c}
              stale={stale || c.stale}
              applying={applyingId === c.id}
              disabled={busy}
              needsReview={suggestionNeedsReview(c)}
              onApply={() => onApply(c)}
              onPreview={(returnTo) => onPreview(c, returnTo)}
              compact
            />
          </li>
        ))}
      </ul>
      {cards.length === 0 && <p className="py-6 text-center text-[13.5px] text-ink-soft">{COPY.suggestEmpty}.</p>}
      <AiDisclosure model={cards[0]?.model} callId={cards[0]?.aiCallId} className="mt-4 border-t border-line/70 pt-3" />
    </SideSheet>
  );
}
