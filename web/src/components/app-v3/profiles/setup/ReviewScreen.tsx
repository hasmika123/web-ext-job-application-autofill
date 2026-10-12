"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, BriefcaseIcon, Button, CheckIcon, GraduationCapIcon, LayersIcon, PencilIcon, SourceChip, SwipeCard, useToast } from "@kiwiply/ui";
import type { ItemData } from "@/lib/profile-items";
import type { Candidate } from "@/lib/profile-setup/draft";
import type { Decision } from "@/lib/profile-setup/import";
import { ONBOARDING_EVENTS as EV, trackOnboarding } from "@/lib/onboarding/events";
import { useDelight } from "@/lib/onboarding/delight";
import { highlightFor, needsNumberTip } from "@/lib/onboarding/highlights";
import type { Persona } from "@/lib/profile-setup/state";
import { summaryLine } from "@/lib/profile-setup/summary";
import ItemForm from "../ItemForm";
import { describeItem, itemBullets, type DraftLimits } from "../itemSchema";
import { useCompanionActive } from "./delight/Companion";
import HighlightChip from "./delight/HighlightChip";
import { useReaction, useSceneLine } from "./delight/useCompanionLines";
import SensitiveNotice from "./SensitiveNotice";
import { SkipButton, StepFooter, StepHeading, StepMascot } from "./parts";

const NOUN: Record<Candidate["section"], string> = {
  EXPERIENCE: "Work experience",
  EDUCATION: "Education",
  PROJECT: "Project",
};
const ICON = { EXPERIENCE: BriefcaseIcon, EDUCATION: GraduationCapIcon, PROJECT: LayersIcon } as const;

/**
 * `review`: one card per screen (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.6). The R1.4 behaviour is kept: Keep / Edit /
 * Skip, a swipe on touch (right keeps, left skips), the arrow keys on the focused card, Keep all the rest, and the
 * recap at the end. What is new: the "3 / 8" counter beside the one question, a Skip that can be taken back (an Undo
 * toast, paused while hovered or focused), the sensitive-values line on the first card only, and the recap as its own
 * screen. Fully controlled: the wizard owns decisions, edits and the cursor (and so the autosaved draft); Back is the
 * shell's top bar, which moves the cursor.
 */
export default function ReviewScreen({
  candidates,
  decisions,
  edits,
  cursor,
  limits,
  removed,
  skillCount,
  mascot,
  persona = null,
  onDecide,
  onUndecide,
  onEdit,
  onKeepRemaining,
  onDone,
  provenance = "PARSED",
}: {
  candidates: Candidate[];
  decisions: Record<string, Decision>;
  edits: Record<string, ItemData>;
  /** Index of the card on screen; `candidates.length` means the recap. */
  cursor: number;
  limits: DraftLimits;
  /** Sensitive values taken out before reading: the lock line on the first card. */
  removed: number;
  /** Skills found, for the recap's "Adding 3 roles, 1 school and 14 skills." */
  skillCount: number;
  mascot: boolean;
  /** The person's persona, for the companion's line on the first card. */
  persona?: Persona | null;
  onDecide: (id: string, decision: Decision) => void;
  /** Take a decision back (Undo on the Skip toast): the card is undecided and on screen again. */
  onUndecide: (id: string) => void;
  onEdit: (id: string, data: ItemData) => void;
  onKeepRemaining: () => void;
  /** The recap's Continue. */
  onDone: (kept: number, skipped: number) => void;
  /** Where an untouched card came from: "PARSED" for a resume, "USER" for the guided "Start fresh" answers. */
  provenance?: "PARSED" | "USER";
}) {
  const toast = useToast();
  const total = candidates.length;
  const card = cursor < total ? candidates[cursor] : null;
  const [editing, setEditing] = useState(false);
  const [announce, setAnnounce] = useState("");
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const shownCursor = useRef(cursor);
  const titleId = useId();

  // The companion (R1.14, DELIGHT 2.5): its resting line for this card (a persona's flavour on the first, "Last one." on the final
  // card, otherwise a rotating line by the card's place) and the recap's; reactions are fired from the decisions below.
  const react = useReaction();
  const delight = useDelight();
  const idleKey = !card ? "recap.idle" : cursor === total - 1 && total > 1 ? "review.last" : cursor === 0 && persona ? `review.idle.${persona}` : "review.idle";
  useSceneLine(card ? "idle" : "cheer", idleKey, { seed: cursor });

  // After a decision (or Back) put focus on the new card's title, so a keyboard user keeps their place. Only when the card
  // really changed: arriving on the screen leaves focus to the shell, which puts it on the heading (and a dev-mode double
  // run of this effect must not take it away).
  useEffect(() => {
    if (shownCursor.current === cursor) return;
    shownCursor.current = cursor;
    cardHeading.current?.focus();
  }, [cursor]);

  const data = card ? (edits[card.id] ?? card.data) : null;
  const described = card && data ? describeItem(card.section, data) : null;

  // Honest highlights (R1.16): from this card's own bullets (the edited ones once an edit is saved), only with delight and its switch on.
  const bulletTexts = useMemo(() => (data ? itemBullets(data).map((b) => b.text) : []), [data]);
  const highlight = useMemo(() => (delight.highlights ? highlightFor(bulletTexts) : null), [delight.highlights, bulletTexts]);
  const numberTip = delight.highlights && card ? needsNumberTip(card.section, bulletTexts) : false;
  const trackedHighlights = useRef(new Set<string>());
  const cardId = card?.id;
  const highlightRule = highlight?.rule;
  useEffect(() => {
    // Once per card shown, rule id only (never any text).
    if (!cardId || !highlightRule || editing || trackedHighlights.current.has(cardId)) return;
    trackedHighlights.current.add(cardId);
    trackOnboarding(EV.delightHighlight, { rule: highlightRule });
  }, [cardId, highlightRule, editing]);

  if (!card || !data || !described) {
    const kept = candidates.filter((c) => decisions[c.id] === "keep");
    const counts = { EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 };
    for (const c of kept) counts[c.section]++;
    return (
      <Recap
        candidates={kept}
        edits={edits}
        line={summaryLine(counts, skillCount)}
        mascot={mascot}
        onContinue={() => onDone(kept.length, total - kept.length)}
      />
    );
  }

  const decide = (d: Decision) => {
    setEditing(false);
    const next = cursor + 1 < total ? `${NOUN[candidates[cursor + 1].section]} ${cursor + 2} of ${total}.` : "That was the last one.";
    setAnnounce(`${d === "keep" ? "Kept" : "Skipped"} ${described.heading}. ${next}`);
    onDecide(card.id, d);
    react(d === "keep" ? "cheer" : "shrug", d === "keep" ? "review.keep" : "review.skip", cursor);
    if (d === "skip") {
      const id = card.id;
      toast({
        title: `Skipped ${described.heading}`,
        action: {
          label: "Undo",
          onClick: () => {
            onUndecide(id);
            setAnnounce("Back in the list.");
            react("peek", "review.undo");
          },
        },
      });
    }
  };

  const bullets = itemBullets(data);
  const decided = decisions[card.id];
  const Icon = ICON[card.section];

  return (
    <div>
      <StepHeading
        title="Does this look right?"
        aside={
          <p className="flex-none pb-1 text-[12.5px] font-semibold tabular-nums text-v2-muted" aria-label={`Card ${cursor + 1} of ${total}`} data-testid="card-counter">
            {cursor + 1} / {total}
          </p>
        }
      />

      {cursor === 0 && removed > 0 && (
        <div className="mt-4">
          <SensitiveNotice removed={removed} />
        </div>
      )}

      <div className="mt-4">
        {editing ? (
          <ItemForm
            section={card.section}
            initial={data}
            limits={limits}
            onSave={async (next) => {
              onEdit(card.id, next);
              setEditing(false);
              setAnnounce(`Saved your changes to ${describeItem(card.section, next).heading} and kept it.`);
              onDecide(card.id, "keep");
              react("cheer", "review.edited");
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <SwipeCard onKeep={() => decide("keep")} onSkip={() => decide("skip")} aria-label={described.heading}>
            <article aria-labelledby={titleId} className="rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft">
              <div className="max-h-[52vh] overflow-y-auto p-4 sm:p-5">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-v2-muted">
                  <Icon size={15} aria-hidden /> {NOUN[card.section]}
                </p>
                <h2 ref={cardHeading} tabIndex={-1} id={titleId} className="mt-1 break-words text-[18px] font-extrabold leading-snug text-v2-navy" style={{ outline: "none" }}>
                  {described.heading}
                </h2>
                {described.meta && <p className="mt-0.5 break-words text-[13px] text-v2-muted">{described.meta}</p>}
                {bullets.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-v2-ink-soft">
                    {bullets.map((b, i) => (
                      <li key={i} className="break-words">
                        {b.text}
                        {highlight && highlight.index === i && <HighlightChip rule={highlight.rule} label={delight.copy(highlight.label)} />}
                      </li>
                    ))}
                  </ul>
                )}
                {numberTip && (
                  <p data-testid="number-tip" className="mt-2 text-[12.5px] leading-snug text-v2-muted">
                    {delight.copy("highlight.tip")}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SourceChip provenance={edits[card.id] ? "USER" : provenance} />
                  {decided && <span className="rounded-full bg-paper-2 px-2 py-[2px] text-[11px] font-semibold text-v2-muted">You chose: {decided === "keep" ? "keep" : "skip"}</span>}
                </div>
              </div>
              <div className="flex justify-end border-t border-v2-line/60 px-2 py-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${described.heading}`} className="border-transparent max-sm:min-h-11">
                  <PencilIcon size={14} aria-hidden /> Edit
                </Button>
              </div>
            </article>
          </SwipeCard>
        )}
      </div>

      {!editing && (
        <>
          <p className="mt-2 text-center text-[12px] text-v2-muted sm:hidden">Swipe right to keep, left to skip</p>
          <StepFooter>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" size="lg" onClick={() => decide("skip")} className="max-sm:min-h-11">
                Skip
              </Button>
              <Button variant="accent" size="lg" onClick={() => decide("keep")} className="max-sm:min-h-11">
                Keep <CheckIcon size={16} aria-hidden />
              </Button>
            </div>
            {cursor >= 1 && total - cursor > 1 && <SkipButton onClick={onKeepRemaining}>Keep all the rest</SkipButton>}
          </StepFooter>
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

function Recap({
  candidates,
  edits,
  line,
  mascot,
  onContinue,
}: {
  /** The kept ones. */
  candidates: Candidate[];
  edits: Record<string, ItemData>;
  line: string;
  mascot: boolean;
  onContinue: () => void;
}) {
  // With the delight companion on it IS the one mascot of this screen (it cheers in its own column), so the v2 clap is not drawn.
  const companion = useCompanionActive();
  return (
    <div className="relative">
      {/* Desktop only: clapping behind the card, clipped on the left (DESIGN 5.6). */}
      {!companion && (
        <div className="pointer-events-none absolute -left-24 top-24 -z-0 hidden opacity-90 xl:block">
          <StepMascot name="clap" enabled={mascot} className="h-32 w-auto" />
        </div>
      )}
      <StepHeading title="Nice. Here's what we'll add." sub={<span data-testid="recap-line">{line}</span>} />
      {candidates.length > 0 && (
        <ul className="relative mt-5 divide-y divide-v2-line/60 rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft">
          {candidates.map((c) => (
            <li key={c.id} className="px-4 py-2.5">
              <p className="break-words text-[14px] font-bold text-v2-navy">{describeItem(c.section, edits[c.id] ?? c.data).heading}</p>
              <p className="break-words text-[12.5px] text-v2-muted">{NOUN[c.section]}</p>
            </li>
          ))}
        </ul>
      )}
      <StepFooter>
        <Button variant="accent" size="lg" onClick={onContinue} className="w-full max-sm:min-h-11">
          Continue <ArrowRightIcon size={16} aria-hidden />
        </Button>
      </StepFooter>
    </div>
  );
}
