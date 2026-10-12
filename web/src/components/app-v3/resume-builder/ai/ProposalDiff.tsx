"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import Link from "next/link";
import { AiDisclosure, AlertIcon, Button, ChoiceGroup, DiffText, InfoIcon, LockIcon, SideSheet, SparklesIcon, Spinner, cn } from "@kiwiply/ui";
import { diffWords } from "@/lib/diff";
import {
  COPY,
  REWRITE_MODES,
  chosenText,
  hasPlaceholder,
  modeLabel,
  quotaSentence,
  usageLine,
  type AiChange,
  type AiProposal,
  type ProposalResult,
  type RewriteMode,
} from "@/lib/resume-ai";

// config-literal-ok: side-sheet width is layout geometry (DESIGN 13.3), not a tunable
const SHEET_WIDTH = 560;

/** What the sheet is showing: waiting for the model, a refusal that needs no answer, an error, or the model's answer. */
export type ProposalSheetView =
  | { phase: "loading"; lines: number }
  | { phase: "locked" }
  | { phase: "error"; message: string; retry: boolean }
  | { phase: "result"; result: ProposalResult };

/** Why Apply did not go through, shown above the buttons. */
export type ApplyProblem = { kind: "stale" | "closed" | "placeholder" | "keepEmpty" | "locked" | "error"; message?: string };

export interface ProposalDiffProps {
  open: boolean;
  phone: boolean;
  /** What is being rewritten, in the sheet's words ("Summary", "Experience", "this bullet"). */
  scope: string;
  view: ProposalSheetView;
  mode: RewriteMode;
  /** Re-run with another mode; omit to hide the picker (a summary proposal has none). */
  onMode?: (mode: RewriteMode) => void;
  applying: boolean;
  problem: ApplyProblem | null;
  /** Apply the ticked changes: refs and an alternative index per ref. */
  onApply: (keep: string[], alternatives: Record<string, number>) => void;
  /** Discard the proposal (the Dismiss button). */
  onDismiss: () => void;
  /** Close without discarding (✕ / Esc / Close): the proposal stays open to come back to. */
  onClose: () => void;
  onRetry: () => void;
  /** Ask again after a stale proposal. */
  onAskAgain: () => void;
  /** The deterministic alternative every refusal offers: the Resume Score tips. */
  onOpenTips?: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

interface Selection {
  id: number | null;
  picked: ReadonlySet<string>;
  alt: Readonly<Record<string, number>>;
  why: ReadonlySet<string>;
}

const initialSelection = (p: AiProposal | undefined): Selection => ({
  id: p?.id ?? null,
  picked: new Set(p?.changes.map((c) => c.ref) ?? []),
  alt: {},
  why: new Set(),
});

function proposalOf(view: ProposalSheetView): AiProposal | undefined {
  if (view.phase !== "result") return undefined;
  const r = view.result;
  return (r.status === "ok" || r.status === "cached") && r.proposal && r.proposal.changes.length > 0 ? r.proposal : undefined;
}

/**
 * ProposalDiff (DESIGN 13.3 / 13.4): the sheet every builder AI proposal is reviewed in. Per change: the line before and
 * after as a word diff, a "Why" that opens the model's reason, a checkbox (all ticked to start), the other wordings as
 * radios when there are several, a warning while the wording still has the `[add a number]` gap (Apply stays off until
 * it is unticked or another wording is chosen) and a note when the line's formatting will be reset. Buttons: Dismiss
 * (discard) and "Apply N selected". Under the changes: the meter line and the AI disclosure. Nothing here edits the
 * resume: Apply hands the refs and indexes to the caller, which writes through the editor so Undo works.
 */
export default function ProposalDiff({
  open,
  phone,
  scope,
  view,
  mode,
  onMode,
  applying,
  problem,
  onApply,
  onDismiss,
  onClose,
  onRetry,
  onAskAgain,
  onOpenTips,
  returnFocusTo,
}: ProposalDiffProps) {
  const proposal = proposalOf(view);
  const [stored, setStored] = useState<Selection>(() => initialSelection(proposal));
  // A new proposal starts from "everything ticked, first wording" (derived during render, not in an effect).
  const sel = stored.id === (proposal?.id ?? null) ? stored : initialSelection(proposal);
  if (sel !== stored) setStored(sel);

  const changes = proposal?.changes ?? [];
  const pickedChanges = changes.filter((c) => sel.picked.has(c.ref));
  const blockedBy = pickedChanges.filter((c) => hasPlaceholder(chosenText(c, sel.alt[c.ref] ?? 0)));
  const canApply = !applying && pickedChanges.length > 0 && blockedBy.length === 0;

  const toggle = (ref: string) => {
    const next = new Set(sel.picked);
    if (next.has(ref)) next.delete(ref);
    else next.add(ref);
    setStored({ ...sel, picked: next });
  };
  const toggleWhy = (ref: string) => {
    const next = new Set(sel.why);
    if (next.has(ref)) next.delete(ref);
    else next.add(ref);
    setStored({ ...sel, why: next });
  };
  const choose = (ref: string, index: number) => setStored({ ...sel, alt: { ...sel.alt, [ref]: index } });
  const apply = () => {
    if (!canApply) return;
    onApply(
      pickedChanges.map((c) => c.ref),
      Object.fromEntries(pickedChanges.map((c) => [c.ref, sel.alt[c.ref] ?? 0])),
    );
  };

  const listRef = useRef<HTMLUListElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      apply();
      return;
    }
    // Up / Down walk the change checkboxes (Space ticks, as on any checkbox); a radio keeps its own arrow keys.
    const target = e.target as HTMLElement;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && target.matches("input[data-change-check]")) {
      const boxes = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>("input[data-change-check]") ?? []);
      const i = boxes.indexOf(target as HTMLInputElement);
      const next = boxes[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        e.preventDefault();
        next.focus();
        next.scrollIntoView?.({ block: "nearest" });
      }
    }
  };

  const showPicker = Boolean(onMode) && view.phase !== "locked" && proposal?.task !== "summary";
  const busy = view.phase === "loading" || applying;
  const description = view.phase === "locked" ? "Part of Pro" : `${scope}${showPicker ? ` · ${modeLabel(mode)}` : ""}`;

  return (
    <SideSheet
      id="rb-ai-sheet"
      side="right"
      mode={phone ? "fullscreen" : "overlay"}
      open={open}
      width={SHEET_WIDTH}
      title="Rewrite with AI"
      description={description}
      icon={<SparklesIcon className="h-5 w-5" />}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      footer={
        proposal ? (
          <>
            <Button variant="accent" size="sm" disabled={!canApply} onClick={apply}>
              {applying ? "Applying…" : `Apply ${pickedChanges.length} selected`}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss} disabled={applying}>
              Dismiss
            </Button>
            <button
              type="button"
              disabled={applying}
              onClick={() => setStored({ ...sel, picked: sel.picked.size === changes.length ? new Set() : new Set(changes.map((c) => c.ref)) })}
              className="ml-auto text-[12.5px] font-semibold text-v2-blue hover:underline disabled:opacity-50"
            >
              {sel.picked.size === changes.length ? "Select none" : "Select all"}
            </button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div onKeyDown={onKeyDown} data-ai-sheet-body>
        {showPicker && (
          <div className="mb-4">
            <p id="rb-ai-mode-label" className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">
              Rewrite as
            </p>
            <ChoiceGroup
              aria-labelledby="rb-ai-mode-label"
              options={REWRITE_MODES.map((m) => ({ value: m.value, label: m.label }))}
              value={mode}
              disabled={busy}
              onChange={(v) => onMode?.(v as RewriteMode)}
            />
          </div>
        )}

        {view.phase === "loading" && (
          <p role="status" className="flex items-center gap-2 py-8 text-[13.5px] text-ink-soft">
            <Spinner role="presentation" aria-hidden className="h-4 w-4" />
            Rewriting {view.lines} {view.lines === 1 ? "line" : "lines"}…
          </p>
        )}

        {view.phase === "locked" && <LockCard />}

        {view.phase === "error" && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-[color-mix(in_srgb,var(--color-danger)_6%,transparent)] p-4">
            <p className="text-[14px] font-semibold text-ink">{view.message}</p>
            <p className="mt-1 text-[12.5px] text-ink-soft">Your resume is untouched.</p>
            {view.retry && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        )}

        {view.phase === "result" && !proposal && <Refusal result={view.result} onRetry={onRetry} onOpenTips={onOpenTips} />}

        {proposal && (
          <>
            {view.phase === "result" && view.result.status === "cached" && (
              <p className="mb-3 rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-ink-soft">You asked this before, so it is the same answer and it cost nothing.</p>
            )}
            <p className="mb-2 text-[12.5px] text-ink-soft" aria-live="polite">
              {`${changes.length} ${changes.length === 1 ? "change" : "changes"} proposed. Untick any you don't want.`}
            </p>
            <ul ref={listRef} role="list" aria-label="Proposed changes" className="flex flex-col gap-3">
              {changes.map((c) => (
                <ChangeCard
                  key={c.ref}
                  change={c}
                  picked={sel.picked.has(c.ref)}
                  altIndex={sel.alt[c.ref] ?? 0}
                  whyOpen={sel.why.has(c.ref)}
                  disabled={applying}
                  onToggle={() => toggle(c.ref)}
                  onWhy={() => toggleWhy(c.ref)}
                  onChoose={(i) => choose(c.ref, i)}
                />
              ))}
            </ul>
            {blockedBy.length > 0 && (
              <p role="alert" className="mt-3 flex items-start gap-2 text-[12.5px] font-semibold text-ink">
                <AlertIcon aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
                {COPY.placeholder}. Pick another wording or untick that change to apply the rest.
              </p>
            )}
            <ProblemNote problem={problem} onAskAgain={onAskAgain} onClose={onClose} />
            <div className="mt-4 space-y-2 border-t border-line/70 pt-3">
              {view.phase === "result" && usageLine(view.result.usage, view.result.cap) && (
                <p className="text-[12px] text-muted">{usageLine(view.result.usage, view.result.cap)}</p>
              )}
              <AiDisclosure model={proposal.model} callId={proposal.aiCallId} />
            </div>
          </>
        )}

        {!proposal && <ProblemNote problem={problem} onAskAgain={onAskAgain} onClose={onClose} />}
      </div>
    </SideSheet>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────────────────────────────── */

function ChangeCard({
  change,
  picked,
  altIndex,
  whyOpen,
  disabled,
  onToggle,
  onWhy,
  onChoose,
}: {
  change: AiChange;
  picked: boolean;
  altIndex: number;
  whyOpen: boolean;
  disabled: boolean;
  onToggle: () => void;
  onWhy: () => void;
  onChoose: (index: number) => void;
}) {
  const uid = useId();
  const alts = change.alternatives && change.alternatives.length > 1 ? change.alternatives : null;
  const text = chosenText(change, altIndex);
  const gap = hasPlaceholder(text);
  return (
    <li data-change-ref={change.ref} className={cn("rounded-xl border p-3 transition-colors", picked ? "border-line bg-paper" : "border-line/60 bg-paper-2/50")}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          data-change-check
          checked={picked}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`Apply change to ${change.section}`}
          className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-accent-deep)] max-sm:h-5 max-sm:w-5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[11.5px] font-bold uppercase tracking-wide text-muted">{change.section}</span>
            <button
              type="button"
              aria-expanded={whyOpen}
              aria-controls={`${uid}-why`}
              onClick={onWhy}
              className="ml-auto inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold text-v2-blue hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent max-sm:min-h-11"
            >
              Why <InfoIcon aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only"> was this changed?</span>
            </button>
          </div>
          <div className="mt-1.5">
            <DiffText parts={diffWords(change.before, text)} aria-label={`Changes to ${change.section}`} />
          </div>
          {whyOpen && (
            <p id={`${uid}-why`} className="mt-2 rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] leading-snug text-ink-soft">
              {change.reason?.trim() ? change.reason : "No reason was given for this one."}
            </p>
          )}
          {change.formatted && <p className="mt-2 text-[12px] text-ink-soft">{COPY.formatted}.</p>}
          {alts && (
            <fieldset className="mt-3 min-w-0 border-0 p-0">
              <legend className="mb-1 p-0 text-[12px] font-bold text-ink-soft">Other wordings</legend>
              <div role="radiogroup" aria-label={`Wording for ${change.section}`} className="flex flex-col gap-1.5">
                {alts.map((a, i) => (
                  <label
                    key={i}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px] leading-snug max-sm:min-h-11",
                      i === altIndex ? "border-accent-deep bg-v2-green-soft/50 text-ink" : "border-line/70 text-ink-soft hover:bg-paper-2",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${uid}-alt`}
                      checked={i === altIndex}
                      disabled={disabled}
                      onChange={() => onChoose(i)}
                      aria-label={`Wording ${i + 1} of ${alts.length} for ${change.section}`}
                      className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-accent-deep)]"
                    />
                    <span className="min-w-0 break-words">{a}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {gap && picked && (
            <p className="mt-2 flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-warn)_16%,transparent)] px-3 py-2 text-[12.5px] font-semibold text-ink">
              <AlertIcon aria-hidden className="mt-0.5 h-4 w-4 flex-none" />
              This wording has a gap, [add a number], for a figure only you know.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/** "AI rewriting is part of Pro" with the way to Pro: the lock in place, never a broken button (DESIGN 13.7). */
export function LockCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl bg-paper-2/60 p-5 text-center", className)}>
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-v2-violet-soft text-v2-violet-ink">
        <LockIcon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[15px] font-bold text-ink">{COPY.locked}</p>
      <p className="mx-auto mt-1 max-w-[34ch] text-[13px] text-ink-soft">{COPY.lockedBody}</p>
      <Link href="/pricing" className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-bold text-on-accent hover:brightness-95 max-sm:min-h-11">
        See Pro
      </Link>
    </div>
  );
}

/** The 200-with-a-status refusals (DESIGN 13.1): each says what happened in plain words and offers the free alternative. */
function Refusal({ result, onRetry, onOpenTips }: { result: ProposalResult; onRetry: () => void; onOpenTips?: () => void }) {
  const quota = result.status === "quotaExceeded" ? quotaSentence(result.usage, result.cap) : null;
  const copy =
    quota ??
    (result.status === "disabled"
      ? { title: COPY.disabled, body: COPY.disabledBody }
      : result.status === "consentRequired"
        ? { title: COPY.consent, body: COPY.consentBody }
        : result.status === "nothingToChange"
          ? { title: COPY.nothing, body: COPY.nothingBody }
          : { title: "Couldn't get a rewrite", body: "Try again in a moment." });
  const canRetry = result.status === "consentRequired" || result.status === "error";
  return (
    <div role="status" data-ai-refusal={result.status} className="rounded-xl bg-paper-2/60 p-5">
      <p className="text-[15px] font-bold text-ink">{copy.title}</p>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">{copy.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        {onOpenTips && (
          <Button variant="ghost" size="sm" onClick={onOpenTips}>
            Run the Resume Score tips
          </Button>
        )}
      </div>
      {usageLine(result.usage, result.cap) && result.status === "quotaExceeded" && <p className="mt-3 text-[12px] text-muted">{usageLine(result.usage, result.cap)}</p>}
    </div>
  );
}

function ProblemNote({ problem, onAskAgain, onClose }: { problem: ApplyProblem | null; onAskAgain: () => void; onClose: () => void }) {
  if (!problem) return null;
  if (problem.kind === "locked") return <LockCard className="mt-4" />;
  const stale = problem.kind === "stale";
  const closed = problem.kind === "closed";
  const text =
    stale
      ? { title: COPY.stale, body: COPY.staleBody }
      : closed
        ? { title: "This suggestion was already used", body: "It was applied or dismissed from another tab." }
        : problem.kind === "placeholder"
          ? { title: COPY.placeholder, body: "Pick another wording or untick that change." }
          : problem.kind === "keepEmpty"
            ? { title: "Tick at least one change", body: "Nothing is selected to apply." }
            : { title: problem.message ?? "Couldn't apply that", body: "Your resume is untouched. Try again." };
  return (
    <div role="alert" data-apply-problem={problem.kind} className="mt-4 rounded-xl border border-danger/30 bg-[color-mix(in_srgb,var(--color-danger)_6%,transparent)] p-4">
      <p className="text-[14px] font-semibold text-ink">{text.title}</p>
      <p className="mt-1 text-[12.5px] text-ink-soft">{text.body}</p>
      {(stale || closed) && (
        <div className="mt-3 flex gap-2">
          {stale && (
            <Button variant="accent" size="sm" onClick={onAskAgain}>
              Ask again
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
