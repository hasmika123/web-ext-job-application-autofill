"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, TouchEvent } from "react";
import { AiDisclosure, ArrowRightIcon, Button, ChevronLeftIcon, ChevronRightIcon, LockIcon, SparklesIcon, Skeleton, Spinner, Tooltip, cn } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { COPY, quotaSentence, suggestionNeedsReview, type AiProposal } from "@/lib/resume-ai";
import RailCard from "../RailCard";
import SuggestionCard from "./SuggestionCard";
import type { Suggestions } from "./useSuggestions";
import UpgradeLink from "../UpgradeLink";

/** A horizontal swipe shorter than this many px is a tap, not a swipe. */
const SWIPE_PX = 40;

export interface AiSuggestionsTabProps {
  /** The plan has builder AI (`config.aiAllowed`); Free sees the locked card (DESIGN 13.7). */
  allowed: boolean;
  suggestions: Suggestions;
  /** The words for this period's Kiwiply AI meter (`describeAiUsage`, computed on the server), or null. */
  aiUsageLine?: { headline: string; detail: string } | null;
  /** The card whose one-click apply is in flight. */
  applyingId: number | null;
  /** Another AI change is being applied: every card waits. */
  busy: boolean;
  onApply: (proposal: AiProposal) => void;
  onPreview: (proposal: AiProposal, returnTo: HTMLElement | null) => void;
  onSeeAll: (returnTo: HTMLElement | null) => void;
}

/** The count pill, as on the board ("AI Suggestions 4"). */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span aria-label={`${count} suggestions`} className={cn("rounded-full bg-v2-blue-soft px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-v2-blue", className)}>
      {count}
    </span>
  );
}

/** Free: the one locked card with the way to Pro (the lock in place, never a hidden feature). */
export function SuggestionsLock() {
  return (
    <div data-suggestions-lock className="rounded-xl bg-paper-2/60 p-4 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-v2-violet-soft text-v2-violet-ink">
        <LockIcon className="h-5 w-5" />
      </span>
      <p className="mt-2 text-[14px] font-semibold text-ink">{COPY.suggestLocked}</p>
      <UpgradeLink onClick={() => track("resume_ai_locked_click", { task: "suggest", from: "rail" })} className="mt-2 inline-flex min-h-9 items-center text-[13px] font-bold text-v2-blue hover:underline max-sm:min-h-11">
        See Pro
      </UpgradeLink>
    </div>
  );
}

/**
 * The AI Suggestions tab of the right rail (DESIGN 10.7, 13.3, 13.7; board `editor-*.webp`): the card with its count
 * badge and "See all", a carousel of suggestion cards (arrows, one dot per card, swipe on touch, no auto-advance),
 * the empty state with "Get suggestions", the stale state with "Refresh", and for Free the one locked card. Opening
 * the tab only reads stored cards; asking for new ones is always a click.
 */
export default function AiSuggestionsTab({ allowed, suggestions, aiUsageLine, applyingId, busy, onApply, onPreview, onSeeAll }: AiSuggestionsTabProps) {
  const title = (
    <>
      <SparklesIcon className="h-4 w-4 text-v2-blue" />
      {COPY.suggestTitle}
    </>
  );

  if (!allowed || suggestions.locked) {
    return (
      <RailCard title={title}>
        <SuggestionsLock />
        {aiUsageLine && (
          <p className="mt-3 text-[12px] leading-snug text-muted">
            {aiUsageLine.headline}. {aiUsageLine.detail}
          </p>
        )}
      </RailCard>
    );
  }

  const { cards, asking, notice, stale, loaded } = suggestions;
  const count = cards.length;
  return (
    <RailCard
      title={
        <>
          {title}
          {count > 0 && <CountBadge count={count} />}
        </>
      }
      aside={
        count > 0 ? (
          <button
            type="button"
            onClick={(e) => onSeeAll(e.currentTarget)}
            className="ml-auto inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-[13px] font-bold text-v2-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11"
          >
            See all <ArrowRightIcon aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : undefined
      }
    >
      {!loaded ? (
        <div aria-hidden className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : count === 0 ? (
        <EmptyState asking={asking} notice={notice} onAsk={() => void suggestions.ask(false)} />
      ) : (
        <>
          {stale && (
            <div role="status" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[color-mix(in_srgb,var(--color-warn)_14%,transparent)] px-3 py-2 text-[12.5px] text-ink">
              <span className="font-semibold">{COPY.suggestStale}.</span>
              <span className="text-ink-soft">{COPY.suggestStaleBody}</span>
              <button
                type="button"
                disabled={asking}
                onClick={() => void suggestions.ask(true)}
                className="ml-auto inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 font-bold text-v2-blue hover:underline disabled:opacity-60 max-sm:min-h-11"
              >
                {asking && <Spinner role="presentation" aria-hidden className="h-3.5 w-3.5" />}
                {asking ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          )}
          {notice && <NoticeLine notice={notice} />}
          <Carousel
            cards={cards}
            stale={stale}
            applyingId={applyingId}
            busy={busy || asking || suggestions.settling}
            onApply={onApply}
            onPreview={onPreview}
          />
          <AiDisclosure model={cards[0]?.model} callId={cards[0]?.aiCallId} className="mt-3" />
        </>
      )}
      {aiUsageLine && (
        <p className="mt-3 text-[12px] leading-snug text-muted">
          {aiUsageLine.headline}. {aiUsageLine.detail}
        </p>
      )}
    </RailCard>
  );
}

function noticeCopy(notice: NonNullable<Suggestions["notice"]>): { title: string; body: string } {
  switch (notice.kind) {
    case "nothing":
      return { title: COPY.suggestNothing, body: COPY.suggestNothingBody };
    case "safe":
      return { title: COPY.suggestSafe, body: COPY.suggestSafeBody };
    case "quota":
      return quotaSentence(notice.usage, notice.cap);
    case "disabled":
      return { title: COPY.suggestDisabled, body: "Everything else in the builder keeps working. Try again in a little while." };
    case "error":
      return { title: notice.message || COPY.suggestError, body: "Your resume is untouched." };
  }
}

function EmptyState({ asking, notice, onAsk }: { asking: boolean; notice: Suggestions["notice"]; onAsk: () => void }) {
  if (asking) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-xl border border-dashed border-line bg-paper-2/60 p-4 text-[13.5px] text-ink-soft">
        <Spinner role="presentation" aria-hidden className="h-4 w-4" />
        Reading your resume…
      </div>
    );
  }
  const copy = notice ? noticeCopy(notice) : { title: COPY.suggestEmpty, body: COPY.suggestEmptyBody };
  const canAsk = !notice || notice.kind === "nothing" || notice.kind === "safe" || notice.kind === "error";
  return (
    <div data-suggestions-empty={notice?.kind ?? "none"} role={notice ? "alert" : undefined} className="rounded-xl border border-dashed border-line bg-paper-2/60 p-4 text-center">
      <p className="text-[14px] font-semibold text-ink">{copy.title}</p>
      <p className="mx-auto mt-1 max-w-[32ch] text-[12.5px] leading-snug text-ink-soft">{copy.body}</p>
      {canAsk && (
        <Button variant="accent" size="sm" className="mt-3 max-sm:min-h-11" onClick={onAsk}>
          <SparklesIcon className="h-4 w-4" /> {notice?.kind === "error" ? "Try again" : notice ? "Check again" : "Get suggestions"}
        </Button>
      )}
    </div>
  );
}

function NoticeLine({ notice }: { notice: NonNullable<Suggestions["notice"]> }) {
  const copy = noticeCopy(notice);
  return (
    <p role="alert" className="mb-3 rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-ink-soft">
      <span className="font-semibold text-ink">{copy.title}.</span> {copy.body}
    </p>
  );
}

/**
 * The carousel (DESIGN 10.7): one card at a time, `‹ ›` arrow buttons, one dot per card, Left / Right keys while focus is
 * inside, swipe on touch. No auto-advance. Announced as a carousel of slides.
 */
function Carousel({
  cards,
  stale,
  applyingId,
  busy,
  onApply,
  onPreview,
}: {
  cards: AiProposal[];
  stale: boolean;
  applyingId: number | null;
  busy: boolean;
  onApply: (p: AiProposal) => void;
  onPreview: (p: AiProposal, returnTo: HTMLElement | null) => void;
}) {
  const uid = useId();
  const [index, setIndex] = useState(0);
  // A card applied or dismissed leaves the list: the next one slides into its place, and the last one steps back.
  const clamped = Math.max(0, Math.min(index, cards.length - 1));
  const current = cards[clamped];
  const go = (to: number) => setIndex(Math.min(Math.max(to, 0), cards.length - 1));

  const touch = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touch.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    if (end - start <= -SWIPE_PX) go(clamped + 1);
    else if (end - start >= SWIPE_PX) go(clamped - 1);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.matches("input, textarea, select")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(clamped + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(clamped - 1);
    }
  };
  if (!current) return null;
  const many = cards.length > 1;
  return (
    <div aria-roledescription="carousel" aria-label="AI suggestions" onKeyDown={onKeyDown} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-carousel>
      <div role="group" aria-roledescription="slide" aria-label={`${clamped + 1} of ${cards.length}`} aria-live="polite" id={`${uid}-slide`}>
        <SuggestionCard
          proposal={current}
          stale={stale || current.stale}
          applying={applyingId === current.id}
          disabled={busy}
          needsReview={suggestionNeedsReview(current)}
          onApply={() => onApply(current)}
          onPreview={(returnTo) => onPreview(current, returnTo)}
        />
      </div>
      {many && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Tooltip content="Previous suggestion" side="top">
            <button
              type="button"
              aria-label="Previous suggestion"
              aria-controls={`${uid}-slide`}
              disabled={clamped === 0}
              onClick={() => go(clamped - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-soft transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 max-sm:h-11 max-sm:w-11"
            >
              <ChevronLeftIcon aria-hidden className="h-4 w-4" />
            </button>
          </Tooltip>
          <div className="flex items-center" role="group" aria-label="Choose a suggestion">
            {cards.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-label={`Suggestion ${i + 1} of ${cards.length}`}
                aria-current={i === clamped ? "true" : undefined}
                onClick={() => go(i)}
                className="group inline-flex h-6 w-5 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent max-sm:h-11 max-sm:w-6"
              >
                <span aria-hidden className={cn("h-2 rounded-full transition-all", i === clamped ? "w-4 bg-v2-blue" : "w-2 bg-line group-hover:bg-ink-soft")} />
              </button>
            ))}
          </div>
          <Tooltip content="Next suggestion" side="top">
            <button
              type="button"
              aria-label="Next suggestion"
              aria-controls={`${uid}-slide`}
              disabled={clamped === cards.length - 1}
              onClick={() => go(clamped + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper text-ink-soft transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 max-sm:h-11 max-sm:w-11"
            >
              <ChevronRightIcon aria-hidden className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
