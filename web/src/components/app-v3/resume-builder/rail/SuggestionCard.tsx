"use client";

import type { ReactNode } from "react";
import { Button, FileTextIcon, LayersIcon, ListIcon, SlidersIcon, Spinner, TargetIcon, cn } from "@kiwiply/ui";
import { COPY, type AiProposal, type SuggestionKind } from "@/lib/resume-ai";

const ICONS: Record<SuggestionKind, (c: string) => ReactNode> = {
  summary: (c) => <FileTextIcon className={c} />,
  bullets: (c) => <ListIcon className={c} />,
  keywords: (c) => <TargetIcon className={c} />,
  skills: (c) => <SlidersIcon className={c} />,
  section: (c) => <LayersIcon className={c} />,
};

/** The kind's icon tile (the board's lilac square): `kind` is null for a card the server gave no kind. */
export function SuggestionIcon({ kind, className }: { kind?: SuggestionKind | null; className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl bg-v2-violet-soft text-v2-violet-ink", className)}>
      {(kind ? ICONS[kind] : ICONS.section)("h-5 w-5")}
    </span>
  );
}

export interface SuggestionCardProps {
  proposal: AiProposal;
  /** Made from an earlier version of the resume: the buttons wait for a refresh. */
  stale: boolean;
  /** This card's Apply is in flight (or another apply is: `disabled`). */
  applying: boolean;
  disabled?: boolean;
  /** A change still has the `[add a number]` gap: "Apply Suggestion" opens the diff to fill it instead of applying. */
  needsReview: boolean;
  onApply: () => void;
  /** `returnTo` is the Preview button: focus goes back to it when the diff closes. */
  onPreview: (returnTo: HTMLElement | null) => void;
  /** Smaller type and no outer chrome, for the See all list. */
  compact?: boolean;
  className?: string;
}

/**
 * One AI Suggestions card (DESIGN 10.7, 13.3; board `editor-*.webp`): an icon tile, the headline, the one-line
 * explanation and two buttons, "Apply Suggestion" (primary: applies every change of the card at once, Undo in the
 * toast) and "Preview" (the diff, to take some of the changes only). A card made from an earlier resume says so and
 * waits for "Refresh" (applying it would be refused: 409).
 */
export default function SuggestionCard({ proposal, stale, applying, disabled = false, needsReview, onApply, onPreview, compact = false, className }: SuggestionCardProps) {
  const n = proposal.changes.length;
  const off = stale || disabled || applying;
  return (
    <article data-suggestion-id={proposal.id} data-suggestion-kind={proposal.kind ?? undefined} data-stale={stale || undefined} className={cn("rounded-xl border border-line/70 bg-paper-2/50 p-3", className)}>
      <div className="flex items-start gap-3">
        <SuggestionIcon kind={proposal.kind} />
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-display font-bold leading-snug text-ink", compact ? "text-[14px]" : "text-[14.5px]")}>{proposal.title ?? "A suggestion"}</h3>
          {proposal.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{proposal.body}</p>}
          <p className="mt-1 text-[11.5px] font-semibold text-muted">
            {n} {n === 1 ? "change" : "changes"}
          </p>
        </div>
      </div>
      {stale && (
        <p role="status" className="mt-2 text-[12.5px] font-semibold text-ink-soft">
          {COPY.suggestStale}: refresh to get suggestions for what is there now.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="accent" size="sm" disabled={off} onClick={onApply} title={needsReview ? "Opens the preview: one wording has a gap to fill" : undefined} className="whitespace-nowrap px-2.5 max-sm:min-h-11">
          {applying ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : null}
          {applying ? "Applying…" : "Apply Suggestion"}
        </Button>
        <Button variant="ghost" size="sm" disabled={stale || disabled} onClick={(e) => onPreview(e.currentTarget)} className="whitespace-nowrap px-2.5 max-sm:min-h-11">
          Preview
        </Button>
      </div>
    </article>
  );
}
