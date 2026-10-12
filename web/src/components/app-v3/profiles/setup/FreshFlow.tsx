"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, ChipInput, ChoiceGroup, Input, MonthPicker, PlusIcon, cn, inputClass } from "@kiwiply/ui";
import { FRESH_GOALS, HEADLINE_SUGGESTIONS, type FreshGoalId } from "@/lib/profile-options";
import type { BioLimits } from "@/lib/profile-setup/draft";
import { MAX_SKILL_CHARS } from "@/lib/profile-setup/draft";
import {
  freshToDraft,
  menuOptions,
  skillSuggestionsFor,
  stepContext,
  stepError,
  type FreshAction,
  type FreshEntry,
  type FreshState,
  type FreshStepId,
  type LinkKey,
  type MenuChoice,
} from "@/lib/profile-setup/fresh";
import type { SetupParse } from "@/lib/profile-setup/parse";

interface Question {
  title: string;
  hint?: string;
}

/** The question each step asks, in the voice of a short conversation. */
function question(step: FreshStepId, state: FreshState): Question {
  const entry = state.entries[state.entries.length - 1];
  const at = entry?.name.trim() ? ` as ${/^[aeiou]/i.test(entry.name.trim()) ? "an" : "a"} ${entry.name.trim()}` : "";
  const first = !state.entries.some((e) => e.name.trim() !== "");
  switch (step) {
    case "goal":
      return { title: "What are you looking for?", hint: "Pick the closest one. We use it to suggest the right things next, and don't save it." };
    case "headline":
      return { title: "How would you describe yourself in one line?", hint: "This sits under your name on your resume. Pick a starter or write your own." };
    case "menu":
      return first
        ? { title: "Let's add your most recent job or school.", hint: "Start with whichever you have. You can add more after." }
        : { title: "Add another?", hint: "Anything else you'd like on your profile." };
    case "role.title":
      return { title: "What was your job title?", hint: "An internship, volunteer role or part-time job counts." };
    case "role.org":
      return { title: `Where did you work${at}?`, hint: "The company or organization." };
    case "role.start":
      return { title: "When did you start?", hint: "A year is enough if you don't remember the month." };
    case "role.end":
      return { title: "When did it end?" };
    case "role.what":
      return { title: `What did you do${at}?`, hint: "One sentence. Start with a verb: served, built, led, organized." };
    case "role.how":
      return { title: "How did you do it?", hint: "The tools, methods or approach. You can skip this." };
    case "role.result":
      return { title: "What was the result?", hint: "A number helps: customers served, hours saved, money raised. You can skip this." };
    case "school.name":
      return { title: "Which school or program?", hint: "A college, a bootcamp, an online course." };
    case "school.degree":
      return { title: "What did you study?", hint: "A degree, certificate or subject. You can skip this." };
    case "school.start":
      return { title: "When did you start?", hint: "A year is enough if you don't remember the month." };
    case "school.end":
      return { title: "When did you finish?", hint: "Or when you expect to." };
    case "skills":
      return { title: "Which skills do you have?", hint: "Press Enter or comma after each one. Tap a suggestion to add it." };
    case "links":
      return { title: "Any links to share?", hint: "All optional. Your LinkedIn, GitHub or a personal site." };
  }
}

const LINK_FIELDS: { key: LinkKey; label: string; placeholder: string }[] = [
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/your-name" },
  { key: "github", label: "GitHub", placeholder: "github.com/your-name" },
  { key: "website", label: "Website", placeholder: "your-site.com" },
];

/**
 * "Start fresh" (Resume Builder R1.5): the guided, chat-like way to build a profile with nothing to
 * upload. One question per screen with a visible Next; chips where the answer is a choice, a month
 * and year picker for dates, What / How / Result prompts for a role's bullets, and "Add another?".
 * Fully controlled: the wizard owns the answers (so Back from the review returns to them and a
 * reload keeps them) and this turns them into the same `SetupParse` Upload and Paste produce.
 */
export default function FreshFlow({
  fresh,
  dispatch,
  bioLimits,
  bulletChars,
  onDone,
  onBack,
}: {
  fresh: FreshState;
  dispatch: (action: FreshAction) => void;
  /** `config.profile` caps; the short answers (title, company, school, headline) use the value cap. */
  bioLimits: BioLimits;
  /** `config.limits.bulletChars`. */
  bulletChars: number;
  onDone: (result: SetupParse) => void;
  /** Back from the first question: the path picker. */
  onBack: () => void;
}) {
  // The message belongs to the question it was raised on; moving to another one hides it.
  const [problem, setProblem] = useState<{ step: FreshStepId; message: string } | null>(null);
  const root = useRef<HTMLFormElement>(null);
  const qid = useId();
  const hintId = `${qid}-hint`;
  const errId = `${qid}-err`;
  const step = fresh.step;
  const error = problem && problem.step === step ? problem.message : null;
  const entry: FreshEntry | undefined = fresh.entries[fresh.entries.length - 1];
  const q = question(step, fresh);
  const limits = { shortChars: bioLimits.valueChars, bulletChars };

  // A new question starts clean and puts the cursor in its answer (a phone opens the keyboard).
  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>('textarea, input:not([type="checkbox"]), [role="radio"][tabindex="0"]');
    el?.focus();
  }, [step]);

  const change = (a: FreshAction) => {
    if (error) setProblem(null);
    dispatch(a);
  };

  function submit() {
    const message = stepError(fresh, limits);
    if (message) {
      setProblem({ step, message });
      return;
    }
    if (step === "links") {
      const { draft, typed } = freshToDraft(fresh);
      onDone({ draft, source: "fresh", removed: 0, typed });
      return;
    }
    dispatch({ type: "next" });
  }

  const aria = {
    "aria-labelledby": qid,
    "aria-describedby": [q.hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : undefined,
  };
  const patch = (p: Partial<FreshEntry>) => change({ type: "entry", patch: p });

  let control: ReactNode = null;
  switch (step) {
    case "goal":
      control = (
        <ChoiceGroup
          aria-labelledby={qid}
          options={FRESH_GOALS.map((g) => ({ value: g.id, label: g.label }))}
          value={fresh.goal}
          allowClear
          onChange={(v) => change({ type: "goal", goal: v as FreshGoalId | "" })}
        />
      );
      break;
    case "headline": {
      const starters = fresh.goal ? HEADLINE_SUGGESTIONS[fresh.goal] : [];
      control = (
        <>
          <Input {...aria} value={fresh.headline} onChange={(e) => change({ type: "headline", value: e.target.value })} placeholder="e.g. Recent graduate seeking an entry-level role" autoComplete="off" />
          {starters.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" aria-label="Starters">
              {starters.map((s) => (
                <li key={s}>
                  <SuggestionChip label={s} onClick={() => change({ type: "headline", value: s })} />
                </li>
              ))}
            </ul>
          )}
        </>
      );
      break;
    }
    case "menu":
      control = <ChoiceGroup aria-labelledby={qid} options={menuOptions(fresh).map((o) => ({ value: o.value, label: o.label }))} value={fresh.choice} onChange={(v) => change({ type: "choice", choice: v as MenuChoice })} />;
      break;
    case "role.title":
    case "school.name":
      control = <Input {...aria} value={entry?.name ?? ""} onChange={(e) => patch({ name: e.target.value })} placeholder={step === "role.title" ? "e.g. Barista, Sales intern" : "e.g. State University"} autoComplete="off" />;
      break;
    case "role.org":
    case "school.degree":
      control = <Input {...aria} value={entry?.detail ?? ""} onChange={(e) => patch({ detail: e.target.value })} placeholder={step === "role.org" ? "e.g. Blue Bottle Coffee" : "e.g. BSc Computer Science"} autoComplete="off" />;
      break;
    case "role.start":
    case "school.start":
      control = <MonthPicker aria-labelledby={qid} value={entry?.start ?? ""} onChange={(v) => patch({ start: v })} invalid={!!error} />;
      break;
    case "role.end":
    case "school.end":
      control = (
        <>
          <MonthPicker aria-labelledby={qid} value={entry?.end ?? ""} onChange={(v) => patch({ end: v })} invalid={!!error} disabled={entry?.current === true} />
          {step === "role.end" && (
            <label className="mt-3 flex min-h-11 items-center gap-2 text-[14px] text-ink sm:min-h-0">
              <input type="checkbox" checked={entry?.current === true} onChange={(e) => patch({ current: e.target.checked })} className="h-4 w-4 accent-[var(--color-v2-green)]" />
              I still work here
            </label>
          )}
        </>
      );
      break;
    case "role.what":
    case "role.how":
    case "role.result": {
      const key = step === "role.what" ? "what" : step === "role.how" ? "how" : "result";
      control = (
        <textarea
          {...aria}
          rows={3}
          value={entry?.[key] ?? ""}
          onChange={(e) => patch({ [key]: e.target.value })}
          placeholder={step === "role.what" ? "e.g. Served 80+ customers a shift at a busy counter" : step === "role.how" ? "e.g. Using the POS system and a team of four" : "e.g. Kept average wait under three minutes"}
          className={`${inputClass} resize-y`}
        />
      );
      break;
    }
    case "skills": {
      const offered = skillSuggestionsFor(fresh);
      control = (
        <>
          <ChipInput label="Skills" value={fresh.skills} onChange={(s) => change({ type: "skills", skills: s })} placeholder="Add a skill" maxChipLength={MAX_SKILL_CHARS} />
          {offered.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[12.5px] font-semibold text-ink-soft">Suggested for you</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {offered.map((s) => (
                  <li key={s.toLowerCase()}>
                    <SuggestionChip label={s} compact onClick={() => change({ type: "skills", skills: [...fresh.skills, s] })} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      );
      break;
    }
    case "links":
      control = (
        <div className="grid gap-x-4 sm:grid-cols-2">
          {LINK_FIELDS.map((f) => (
            <LinkInput key={f.key} label={f.label} placeholder={f.placeholder} value={fresh.links[f.key]} invalid={!!error} onChange={(v) => change({ type: "link", key: f.key, value: v })} wide={f.key === "website"} />
          ))}
        </div>
      );
      break;
  }

  return (
    <form
      ref={root}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-[12.5px] font-semibold text-v2-muted" data-testid="fresh-context">
        {stepContext(fresh)}
      </p>
      <h2 id={qid} className="mt-1 font-display text-[20px] font-extrabold text-v2-navy">
        {q.title}
      </h2>
      {q.hint && (
        <p id={hintId} className="mt-1 text-[14px] text-v2-ink-soft">
          {q.hint}
        </p>
      )}
      <div className="mt-5">{control}</div>
      {error && (
        <p id={errId} role="alert" className="mt-3 text-[14px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => (step === "goal" ? onBack() : dispatch({ type: "back" }))} className="max-sm:min-h-11">
          Back
        </Button>
        <Button type="submit" variant="accent" className="max-sm:min-h-11">
          Next
        </Button>
      </div>
      {step === "links" && (
        <p className="mt-3 text-[12.5px] text-v2-muted">Next shows what you told us as cards you can keep, edit or skip. Nothing is saved until you finish.</p>
      )}
    </form>
  );
}

function SuggestionChip({ label, onClick, compact }: { label: string; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Use ${label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-v2-line bg-paper text-left text-[13px] font-medium text-v2-ink-soft",
        "hover:border-accent hover:bg-accent-soft/50 max-sm:min-h-11",
        compact ? "px-3 py-1" : "px-3 py-1.5",
      )}
    >
      <PlusIcon size={12} aria-hidden /> {label}
    </button>
  );
}

function LinkInput({ label, placeholder, value, invalid, onChange, wide }: { label: string; placeholder: string; value: string; invalid: boolean; onChange: (v: string) => void; wide?: boolean }) {
  const id = useId();
  return (
    <div className={cn("mb-[15px]", wide && "sm:col-span-2")}>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
        {label}
      </label>
      <Input id={id} type="url" inputMode="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" aria-invalid={invalid && value.trim() !== "" ? true : undefined} />
    </div>
  );
}
