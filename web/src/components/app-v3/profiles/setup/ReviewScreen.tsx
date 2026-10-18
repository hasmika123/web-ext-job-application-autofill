"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  AnimatedNumber,
  ArrowRightIcon,
  BriefcaseIcon,
  Button,
  CardStack,
  CheckIcon,
  GraduationCapIcon,
  LayersIcon,
  PencilIcon,
  SourceChip,
  SparkleBurst,
  SwipeCard,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { ItemData } from "@/lib/profile-items";
import type { Candidate } from "@/lib/profile-setup/draft";
import type { Decision } from "@/lib/profile-setup/import";
import { ONBOARDING_EVENTS as EV, trackOnboarding } from "@/lib/onboarding/events";
import { useDelight } from "@/lib/onboarding/delight";
import { highlightFor, needsNumberTip, type Highlight } from "@/lib/onboarding/highlights";
import type { Persona } from "@/lib/profile-setup/state";
import { summaryLine } from "@/lib/profile-setup/summary";
import ItemForm from "../ItemForm";
import { describeItem, itemBullets, type DraftLimits } from "../itemSchema";
import { useCompanionActive } from "./delight/Companion";
import ComboChip, { COMBO_FROM, isComboMilestone } from "./delight/ComboChip";
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

/** The review's "in a row" count for this visit to the setup: session-only (never saved), held by the wizard so the recap (its own screen) can report it. */
export interface ReviewSession {
  /** Consecutive Keeps right now. */
  count: number;
  /** The longest run this visit. */
  max: number;
}

/** The card that just left, drawn flying off (R1.15). */
interface Leaving {
  key: number;
  dir: Decision;
  from?: number;
  node: ReactNode;
}

/**
 * `review`: one card per screen (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.6). The R1.4 behaviour is kept: Keep / Edit /
 * Skip, a swipe on touch (right keeps, left skips), the arrow keys on the focused card, Keep all the rest, and the
 * recap at the end. What is new: the "3 / 8" counter beside the one question, a Skip that can be taken back (an Undo
 * toast, paused while hovered or focused), the sensitive-values line on the first card only, and the recap as its own
 * screen. Fully controlled: the wizard owns decisions, edits and the cursor (and so the autosaved draft); Back is the
 * shell's top bar, which moves the cursor.
 *
 * With the delight layer on (R1.14-R1.16) the review is a small game and never a slower one: the card is a stack with two ghosts
 * peeking out, a swipe or a tap stamps KEEP ✓ / SKIP and flies the card off in 240 ms while the next one springs up and is live from
 * the first frame (a second decision during the fling works), the counter flips, Keep throws sparkles, a quiet "🔥 n in a row"
 * badge sits on the stack after three Keeps, a phone gets a short haptic tap, and ← → E Z work from anywhere on the screen. The
 * companion cheers or shrugs; one honest chip may mark a bullet. Every one of those has a static twin under reduced motion, and
 * with the layer off none of it is drawn: the DOM is the v2 DOM.
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
  combo: comboProp,
  onCombo,
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
  /** The "in a row" count, held by the wizard because the recap is a separate screen. Without it (and `onCombo`) the screen keeps its own. */
  combo?: ReviewSession;
  onCombo?: (next: ReviewSession) => void;
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
  const stackOn = delight.on;
  const idleKey = !card ? "recap.idle" : cursor === total - 1 && total > 1 ? "review.last" : cursor === 0 && persona ? `review.idle.${persona}` : "review.idle";
  useSceneLine(card ? "idle" : "cheer", idleKey, { seed: cursor });

  // The game (R1.15): the card that is flying off, the "in a row" count, the sparkles. All session-only, none of it saved anywhere.
  const [ownCombo, setOwnCombo] = useState<ReviewSession>({ count: 0, max: 0 });
  const run = comboProp ?? ownCombo;
  const setRun = onCombo ?? setOwnCombo;
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [burst, setBurst] = useState<{ n: number; from: "button" | "card" } | null>(null);
  const seq = useRef(0);

  // After a decision (or Back) put focus on the new card's title, so a keyboard user keeps their place. Only when the card
  // really changed: arriving on the screen leaves focus to the shell, which puts it on the heading (and a dev-mode double
  // run of this effect must not take it away).
  useEffect(() => {
    if (shownCursor.current === cursor) return;
    shownCursor.current = cursor;
    cardHeading.current?.focus();
  }, [cursor]);

  // When the editor closes (saved or cancelled) focus goes back to the card's title, so the keys and Tab carry on from the card.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) cardHeading.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

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

  // At the recap: how long the longest run of Keeps was (0 when it never got to three). Once, a number only.
  const atRecap = !card;
  const reported = useRef(false);
  useEffect(() => {
    if (!atRecap || reported.current || !delight.on || !delight.combo) return;
    reported.current = true;
    trackOnboarding(EV.delightCombo, { max: run.max >= COMBO_FROM ? run.max : 0 });
  }, [atRecap, delight.on, delight.combo, run.max]);

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

  const bullets = itemBullets(data);
  const decided = decisions[card.id];
  const Icon = ICON[card.section];
  const sourceProvenance = edits[card.id] ? "USER" : provenance;
  const highlightLabel = highlight ? delight.copy(highlight.label) : "";

  /** The card's face. The live one has the title's id and the Edit button; the picture of the one that just left has neither. */
  const article = (live: boolean): ReactNode => (
    <CardArticle
      live={live}
      icon={<Icon size={15} aria-hidden />}
      noun={NOUN[card.section]}
      heading={described.heading}
      meta={described.meta}
      bullets={bullets.map((b) => b.text)}
      highlight={highlight}
      highlightLabel={highlightLabel}
      tip={numberTip ? delight.copy("highlight.tip") : null}
      provenance={sourceProvenance}
      decided={decided}
      titleId={titleId}
      headingRef={cardHeading}
      onEdit={() => setEditing(true)}
    />
  );

  /** The consecutive-Keeps count after a decision (an edit that is then kept is a Keep); Undo never brings it back. */
  const note = (d: Decision): number => {
    const next = d === "keep" ? run.count + 1 : 0;
    setRun({ count: next, max: Math.max(run.max, next) });
    return next;
  };

  const decide = (d: Decision, how: "button" | "key" | "swipe" = "button", info?: { dx: number }) => {
    setEditing(false);
    const next = cursor + 1 < total ? `${NOUN[candidates[cursor + 1].section]} ${cursor + 2} of ${total}.` : "That was the last one.";
    setAnnounce(`${d === "keep" ? "Kept" : "Skipped"} ${described.heading}. ${next}`);
    if (stackOn) {
      // The decision is dispatched NOW: the next card is live underneath from the first frame; this is only the picture leaving.
      seq.current += 1;
      setLeaving({
        key: seq.current,
        dir: d,
        from: info?.dx,
        node: (
          <SwipeCard stamp fling={d} disabled aria-label={described.heading} onKeep={noop} onSkip={noop}>
            {article(false)}
          </SwipeCard>
        ),
      });
      if (d === "keep") setBurst({ n: seq.current, from: how === "swipe" ? "card" : "button" });
      if (how === "key") trackOnboarding(EV.delightShortcut, { key: d === "keep" ? "right" : "left" });
    }
    onDecide(card.id, d);
    const n = note(d);
    delight.tap("decision");
    if (d === "keep" && delight.combo && isComboMilestone(n)) react("cheer", n === COMBO_FROM ? "review.combo" : "combo.chip", 0, { n });
    else react(d === "keep" ? "cheer" : "shrug", d === "keep" ? "review.keep" : "review.skip", cursor);
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

  /** Z: take back the last decision, exactly what the toast's Undo does (only when there is a previous card that was decided). */
  const undoPrevious = () => {
    const prev = cursor > 0 ? candidates[cursor - 1] : null;
    if (!prev || !decisions[prev.id]) return;
    onUndecide(prev.id);
    setAnnounce("Back in the list.");
    react("peek", "review.undo");
  };

  /**
   * ← Skip, → Keep, E Edit, Z Undo from anywhere on the screen (additive: Tab order is unchanged). Not inside a field, not with a
   * modifier held, not while the editor is open, and not when the card itself already handled the arrow.
   */
  const onKey = (e: KeyEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || editing) return;
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    switch (e.key.toLowerCase()) {
      case "arrowleft":
        e.preventDefault();
        decide("skip", "key");
        break;
      case "arrowright":
        e.preventDefault();
        decide("keep", "key");
        break;
      case "e":
        e.preventDefault();
        setEditing(true);
        trackOnboarding(EV.delightShortcut, { key: "e" });
        break;
      case "z":
        e.preventDefault();
        undoPrevious();
        trackOnboarding(EV.delightShortcut, { key: "z" });
        break;
    }
  };

  const counter = (
    <p className="flex-none pb-1 text-[12.5px] font-semibold tabular-nums text-v2-muted" aria-label={`Card ${cursor + 1} of ${total}`} data-testid="card-counter">
      {stackOn ? <AnimatedNumber value={cursor + 1} announce={false} /> : cursor + 1} / {total}
    </p>
  );

  const keepButton = (
    <Button variant="accent" size="lg" onClick={() => decide("keep")} className={cn("max-sm:min-h-11", stackOn && "w-full")}>
      Keep <CheckIcon size={16} aria-hidden />
    </Button>
  );

  const swipeCard = (
    <SwipeCard
      key={card.id}
      onKeep={(info) => decide("keep", info ? "swipe" : "key", info)}
      onSkip={(info) => decide("skip", info ? "swipe" : "key", info)}
      aria-label={described.heading}
      stamp={stackOn}
      keyShortcuts={stackOn ? "ArrowRight ArrowLeft e z" : undefined}
    >
      {article(true)}
    </SwipeCard>
  );

  return (
    <div onKeyDown={stackOn ? onKey : undefined}>
      {stackOn && <BodyKeys onKey={onKey} />}
      <StepHeading title="Does this look right?" aside={counter} />

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
              note("keep");
              delight.tap("decision");
              react("cheer", "review.edited");
            }}
            onCancel={() => setEditing(false)}
          />
        ) : stackOn ? (
          <CardStack
            ghosts={Math.min(2, total - cursor - 1) as 0 | 1 | 2}
            cardKey={card.id}
            leaving={leaving}
            onLeft={() => setLeaving(null)}
            overlay={
              <>
                {delight.combo && (
                  <div className="pointer-events-none absolute -top-3.5 left-1/2 z-20 -translate-x-1/2">
                    <ComboChip count={run.count} />
                  </div>
                )}
                {burst?.from === "card" && <SparkleBurst key={burst.n} />}
              </>
            }
          >
            {swipeCard}
          </CardStack>
        ) : (
          swipeCard
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
              {stackOn ? (
                <div className="relative">
                  {keepButton}
                  {burst?.from === "button" && <SparkleBurst key={burst.n} />}
                </div>
              ) : (
                keepButton
              )}
            </div>
            {cursor >= 1 && total - cursor > 1 && <SkipButton onClick={onKeepRemaining}>Keep all the rest</SkipButton>}
            {stackOn && <KeyLegend line={delight.copy("keys.legend")} />}
          </StepFooter>
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

const noop = () => undefined;

/**
 * Keys also work when nothing is focused (after a click on blank space): focus is then on the page itself, outside the screen's
 * subtree, so the screen listens for it there. Only for an event whose target is the body: a focused control keeps its own keys.
 */
function BodyKeys({ onKey }: { onKey: (e: KeyEvent) => void }) {
  const latest = useRef(onKey);
  useEffect(() => {
    latest.current = onKey;
  });
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.target === document.body) latest.current(e);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return null;
}

/** What the key handler reads: the same fields on React's synthetic event and on the browser's own. */
interface KeyEvent {
  key: string;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

/** The card's face. */
function CardArticle({
  live,
  icon,
  noun,
  heading,
  meta,
  bullets,
  highlight,
  highlightLabel,
  tip,
  provenance,
  decided,
  titleId,
  headingRef,
  onEdit,
}: {
  live: boolean;
  icon: ReactNode;
  noun: string;
  heading: string;
  meta: string;
  bullets: string[];
  highlight: Highlight | null;
  highlightLabel: string;
  tip: string | null;
  provenance: "PARSED" | "USER";
  decided?: Decision;
  titleId: string;
  headingRef: MutableRefObject<HTMLHeadingElement | null>;
  onEdit: () => void;
}) {
  return (
    <article aria-labelledby={live ? titleId : undefined} className="rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft">
      {/* touch-pan-y: this is the card's own scroll container, and a touch that starts inside one only inherits `touch-action` up to it, so without
          it the browser takes a sideways drag for a pan and cancels the swipe before the stamp shows. */}
      <div className="max-h-[52vh] touch-pan-y overflow-y-auto p-4 sm:p-5">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-v2-muted">
          {icon} {noun}
        </p>
        <h2
          ref={live ? headingRef : undefined}
          tabIndex={live ? -1 : undefined}
          id={live ? titleId : undefined}
          className="mt-1 break-words text-[18px] font-extrabold leading-snug text-v2-navy"
          style={{ outline: "none" }}
        >
          {heading}
        </h2>
        {meta && <p className="mt-0.5 break-words text-[13px] text-v2-muted">{meta}</p>}
        {bullets.length > 0 && (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-v2-ink-soft">
            {bullets.map((text, i) => (
              <li key={i} className="break-words">
                {text}
                {highlight && highlight.index === i && <HighlightChip rule={highlight.rule} label={highlightLabel} />}
              </li>
            ))}
          </ul>
        )}
        {tip && (
          <p data-testid={live ? "number-tip" : undefined} className="mt-2 text-[12.5px] leading-snug text-v2-muted">
            {tip}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SourceChip provenance={provenance} />
          {decided && <span className="rounded-full bg-paper-2 px-2 py-[2px] text-[11px] font-semibold text-v2-muted">You chose: {decided === "keep" ? "keep" : "skip"}</span>}
        </div>
      </div>
      <div className="flex justify-end border-t border-v2-line/60 px-2 py-1">
        {live ? (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${heading}`} className="border-transparent max-sm:min-h-11">
            <PencilIcon size={14} aria-hidden /> Edit
          </Button>
        ) : (
          // The picture of a card that has left: the same height as the live one, nothing to tab to or click.
          <span className="inline-flex min-h-8 items-center gap-1 px-3 text-[13px] font-semibold text-v2-muted">
            <PencilIcon size={14} aria-hidden /> Edit
          </span>
        )}
      </div>
    </article>
  );
}

/** "← Skip · → Keep · E Edit · Z Undo" as four keycaps, from `sm` up (a phone has no keyboard; its hint is "Swipe right to keep"). */
function KeyLegend({ line }: { line: string }) {
  const parts = line.split(" · ").map((p) => {
    const [key, ...rest] = p.split(" ");
    return { key, label: rest.join(" ") };
  });
  return (
    <p data-testid="key-legend" className="mt-1 hidden flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-v2-muted sm:flex">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden>·</span>}
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-v2-line bg-paper px-1.5 py-px font-sans text-[11px] font-semibold text-v2-ink-soft">{p.key}</kbd> {p.label}
          </span>
        </Fragment>
      ))}
    </p>
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
