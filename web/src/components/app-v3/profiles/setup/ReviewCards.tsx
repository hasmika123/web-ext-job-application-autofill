"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button, PencilIcon, SourceChip, SwipeCard, cn } from "@kiwiply/ui";
import type { ItemData } from "@/lib/profile-items";
import type { Candidate } from "@/lib/profile-setup/draft";
import type { Decision } from "@/lib/profile-setup/import";
import ItemForm from "../ItemForm";
import { describeItem, itemBullets, type DraftLimits } from "../itemSchema";

const NOUN: Record<Candidate["section"], string> = {
  EXPERIENCE: "Work experience",
  EDUCATION: "Education",
  PROJECT: "Project",
};

/**
 * Card-by-card review (DESIGN v1 2.3): one card per parsed experience / education / project with Keep,
 * Edit and Skip. On a phone the card also answers a swipe (right keeps, left skips); the buttons are
 * always there and the arrow keys work with the card focused. Fully controlled, so the wizard owns the
 * decisions (and its abandon-safe draft) and the new-resume chooser can reuse the cards as they are.
 * Edit opens the same inline `ItemForm` the profile uses; saving an edit keeps the entry.
 * After the last card a recap lists what was kept and offers Continue.
 */
export default function ReviewCards({
  candidates,
  decisions,
  edits,
  cursor,
  limits,
  onDecide,
  onEdit,
  onCursor,
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
  onDecide: (id: string, decision: Decision) => void;
  onEdit: (id: string, data: ItemData) => void;
  onCursor: (cursor: number) => void;
  onKeepRemaining: () => void;
  onDone: () => void;
  /** Where an untouched card came from: "PARSED" for a resume, "USER" for the guided "Start fresh" answers. */
  provenance?: "PARSED" | "USER";
}) {
  const total = candidates.length;
  const card = cursor < total ? candidates[cursor] : null;
  const [editing, setEditing] = useState(false);
  const [announce, setAnnounce] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const titleId = useId();

  // Move focus to the new card (or the recap) after a decision so keyboard users keep their place.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [cursor]);

  const data = card ? (edits[card.id] ?? card.data) : null;
  const described = card && data ? describeItem(card.section, data) : null;
  const decide = (d: Decision) => {
    if (!card || !described) return;
    setEditing(false);
    setAnnounce(`${d === "keep" ? "Kept" : "Skipped"} ${described.heading}. ${cursor + 1 < total ? `${NOUN[candidates[cursor + 1].section]} ${cursor + 2} of ${total}.` : "That was the last one."}`);
    onDecide(card.id, d);
  };

  if (!card || !data || !described) return <Recap candidates={candidates} decisions={decisions} edits={edits} onBack={() => onCursor(total - 1)} onDone={onDone} headingRef={headingRef} />;

  const bullets = itemBullets(data);
  const kept = decisions[card.id];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-semibold text-v2-muted">
          {NOUN[card.section]} · {cursor + 1} of {total}
        </p>
        {total - cursor > 1 && (
          <button type="button" onClick={onKeepRemaining} className="text-[12.5px] font-semibold text-v2-blue hover:underline max-sm:min-h-11">
            Keep all {total - cursor} remaining
          </button>
        )}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={cursor}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(cursor / total) * 100}%` }} />
      </div>

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
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <SwipeCard onKeep={() => decide("keep")} onSkip={() => decide("skip")} aria-label={described.heading}>
            <article className="rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-5">
              <h3 ref={headingRef} tabIndex={-1} id={titleId} className="break-words text-[17px] font-extrabold leading-snug text-v2-navy outline-none">
                {described.heading}
              </h3>
              {described.meta && <p className="mt-0.5 break-words text-[13px] text-v2-muted">{described.meta}</p>}
              {bullets.length > 0 && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-v2-ink-soft">
                  {bullets.map((b, i) => (
                    <li key={i} className="break-words">
                      {b.text}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SourceChip provenance={edits[card.id] ? "USER" : provenance} />
                {kept && <span className="rounded-full bg-paper-2 px-2 py-[2px] text-[11px] font-semibold text-v2-muted">You chose: {kept === "keep" ? "keep" : "skip"}</span>}
              </div>
            </article>
          </SwipeCard>
        )}
      </div>

      {!editing && (
        <>
          <p className="mt-2 text-center text-[12px] text-v2-muted sm:hidden">Swipe right to keep, left to skip</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => onCursor(cursor - 1)} disabled={cursor === 0} className={cn("max-sm:min-h-11", cursor === 0 && "invisible")}>
              Back
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => decide("skip")} className="max-sm:min-h-11">
                Skip
              </Button>
              <Button variant="ghost" onClick={() => setEditing(true)} className="max-sm:min-h-11" aria-label={`Edit ${described.heading}`}>
                <PencilIcon size={15} aria-hidden /> Edit
              </Button>
              <Button variant="accent" onClick={() => decide("keep")} className="max-sm:min-h-11">
                Keep
              </Button>
            </div>
          </div>
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
  decisions,
  edits,
  onBack,
  onDone,
  headingRef,
}: {
  candidates: Candidate[];
  decisions: Record<string, Decision>;
  edits: Record<string, ItemData>;
  onBack: () => void;
  onDone: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const keptList = candidates.filter((c) => decisions[c.id] === "keep");
  const skipped = candidates.length - keptList.length;
  return (
    <div>
      <h3 ref={headingRef} tabIndex={-1} className="font-display text-[20px] font-extrabold text-v2-navy outline-none">
        {candidates.length === 0 ? "No entries found" : `You kept ${keptList.length} of ${candidates.length}`}
      </h3>
      <p className="mt-1 text-[14px] text-v2-ink-soft">
        {candidates.length === 0
          ? "We didn't find work history, education or projects. You can add them later from your profile."
          : skipped > 0
            ? `${skipped} skipped. They won't be added to your profile.`
            : "Everything will be added to your profile when you finish."}
      </p>
      {keptList.length > 0 && (
        <ul className="mt-4 divide-y divide-v2-line/60 rounded-2xl border border-v2-line/70 bg-paper">
          {keptList.map((c) => (
            <li key={c.id} className="px-4 py-2.5">
              <p className="break-words text-[14px] font-bold text-v2-navy">{describeItem(c.section, edits[c.id] ?? c.data).heading}</p>
              <p className="break-words text-[12.5px] text-v2-muted">{NOUN[c.section]}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        {candidates.length > 0 ? (
          <Button variant="ghost" onClick={onBack} className="max-sm:min-h-11">
            Back to the last card
          </Button>
        ) : (
          <span />
        )}
        <Button variant="accent" onClick={onDone} className="max-sm:min-h-11">
          Continue
        </Button>
      </div>
    </div>
  );
}
