"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRightIcon, Button, ChevronDownIcon, ChoiceGroup, MonthPicker, isMonthValue } from "@kiwiply/ui";
import PreferenceInputs, { type PreferenceQuestion } from "@/components/onboarding/preferences";
import { START_AFTER_GRAD, START_RIGHT_AWAY, noticeForMonth, prefRewrite, prefTip, type PrefId } from "@/lib/onboarding/persona";
import type { Persona } from "@/lib/profile-setup/state";
import { useReaction, useSceneLine } from "./delight/useCompanionLines";
import { SkipButton, StepFooter, StepHeading } from "./parts";

/** The id of a question: its first bio key (the self-identification block is `gender`). */
export const prefId = (q: PreferenceQuestion): PrefId => q.keys[0] as PrefId;

/** True when this answer set has something to write for the question (the Continue button is on only then). */
export function hasAnswer(q: PreferenceQuestion, answers: Record<string, string>): boolean {
  const filled = (k: string) => (answers[k] ?? "").trim() !== "";
  return q.keys.some(filled);
}

/**
 * What a question writes (DESIGN 5.9): one entry per key it owns that has a value. A student's or first-job seeker's start date
 * is stored as the notice option nearest the month they named (`NOTICE` is what forms fill) and the month itself as
 * `earliestStartDate`; "Right away" is `Immediately`. Blank keys write nothing.
 */
export function valuesToWrite(q: PreferenceQuestion, answers: Record<string, string>, persona: Persona | null): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = prefRewrite(persona, prefId(q)).startChips ? [...q.keys, "earliestStartDate"] : q.keys;
  for (const k of keys) {
    const v = (answers[k] ?? "").trim();
    if (v) out[k] = v;
  }
  return out;
}

/**
 * `prefs`: ONE application question per screen, in the persona's order (Onboarding v2 R1.11, ONBOARDING-V2-DESIGN 5.9). A tap
 * on a chip is an answer; Continue writes it (the shell does the merge PUT) and moves on; "Skip this one" writes nothing and
 * moves on. Nothing is ever pre-selected. The persona rewords the start-date and salary questions; the self-identification
 * block is always last, collapsed, optional. On the last screen "Show all questions" brings back anything the persona hid.
 * Fully controlled: the wizard holds the index, the answers and the saving state.
 */
export default function PrefsFlow({
  question,
  persona,
  answers,
  first,
  index = 0,
  last,
  hiddenLeft,
  saving,
  error,
  retryWrapUp,
  onChange,
  onContinue,
  onSkip,
  onShowAll,
}: {
  question: PreferenceQuestion;
  persona: Persona | null;
  answers: Record<string, string>;
  /** The first question on show: it carries the persona's one-line tip. */
  first: boolean;
  /** Where this question stands in the list (0 = first); the companion's line rotates by it. */
  index?: number;
  /** The last question on show: its Continue / Skip wraps up, and it offers "Show all questions" when any are hidden. */
  last: boolean;
  /** How many questions the persona hid and the person has not asked for. */
  hiddenLeft: number;
  saving: boolean;
  error: string | null;
  /** The answers are saved and only the wrap-up failed: Continue / Skip just try that again. */
  retryWrapUp: boolean;
  onChange: (key: string, value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  onShowAll: () => void;
}) {
  const titleId = useId();
  const id = prefId(question);
  const rewrite = prefRewrite(persona, id);
  const title = rewrite.title ?? question.title;
  const why = rewrite.why ?? question.why;
  const eeo = id === "gender";
  const tip = first ? prefTip(persona) : null;

  // The start-date question of a student / first job: two chips, and a month when it is "After I graduate".
  const month = answers.earliestStartDate ?? "";
  const [later, setLater] = useState(() => month !== "");
  const startMode = later ? START_AFTER_GRAD : (answers.noticePeriod ?? "") === "Immediately" ? START_RIGHT_AWAY : "";
  const startReady = startMode === START_RIGHT_AWAY || (startMode === START_AFTER_GRAD && isMonthValue(month));
  const setStart = (v: string) => {
    if (v === START_RIGHT_AWAY) {
      setLater(false);
      onChange("earliestStartDate", "");
      onChange("noticePeriod", "Immediately");
    } else if (v === START_AFTER_GRAD) {
      setLater(true);
      onChange("noticePeriod", "");
    } else {
      setLater(false);
      onChange("noticePeriod", "");
      onChange("earliestStartDate", "");
    }
  };
  const setMonth = (m: string) => {
    onChange("earliestStartDate", m);
    onChange("noticePeriod", isMonthValue(m) ? noticeForMonth(m) : "");
  };

  const ready = rewrite.startChips ? startReady : hasAnswer(question, answers);

  // The companion (R1.14): a quiet line per question (rotating by the question's place), and a cheer the moment it is answered.
  const react = useReaction();
  useSceneLine("idle", eeo ? "prefs.eeo" : first ? "prefs.first" : "prefs.idle", { seed: index });
  const wasReady = useRef(ready);
  useEffect(() => {
    if (ready && !wasReady.current) react("cheer");
    wasReady.current = ready;
  }, [ready, react]);
  const body = rewrite.startChips ? (
    <div>
      <ChoiceGroup aria-labelledby={titleId} size="lg" options={[START_RIGHT_AWAY, START_AFTER_GRAD]} value={startMode} onChange={setStart} allowClear />
      {startMode === START_AFTER_GRAD && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12.5px] font-semibold text-v2-ink-soft">Which month?</p>
          <MonthPicker aria-label="The month you could start" value={month} onChange={setMonth} />
        </div>
      )}
    </div>
  ) : (
    <PreferenceInputs question={question} answers={answers} onChange={onChange} labelledBy={titleId} idPrefix={`pref-${id}`} salaryHint={rewrite.hint} />
  );

  return (
    <div>
      <StepHeading id={titleId} title={title} sub={why} />
      {tip && <p className="mt-2 rounded-xl bg-accent-soft/60 px-3 py-2 text-[13px] font-medium text-accent-deep">{tip}</p>}

      <div className="mt-5">
        {eeo ? (
          <details className="group rounded-2xl border border-v2-line/70 bg-paper p-3 sm:p-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-semibold text-v2-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              Show the questions
              <ChevronDownIcon size={16} className="flex-none text-v2-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-3">{body}</div>
          </details>
        ) : (
          body
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[14px] font-medium text-danger">
          {error}
        </p>
      )}

      <StepFooter>
        <Button variant="accent" size="lg" onClick={onContinue} disabled={saving || (!ready && !retryWrapUp)} className="w-full max-sm:min-h-11">
          {saving ? "Saving…" : retryWrapUp ? "Try again" : "Continue"} {!saving && <ArrowRightIcon size={16} aria-hidden />}
        </Button>
        <SkipButton onClick={onSkip} disabled={saving}>
          Skip this one
        </SkipButton>
        {last && hiddenLeft > 0 && <SkipButton onClick={onShowAll}>Show all questions</SkipButton>}
      </StepFooter>
    </div>
  );
}
