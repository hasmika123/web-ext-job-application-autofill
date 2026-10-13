"use client";

import { Input, Field, Select, ChoiceGroup } from "@/components/ui";
import { LIMITS } from "@/lib/validate";
import { GENDERS, HISPANIC, NOTICE, RACES, VETERAN, DISABILITY, WORK_PREFERENCE, YESNO } from "@/lib/profile-options";

/**
 * The six `/welcome` questions (Phase 10.3b) as data plus the one component that renders a question.
 * The setup flow (Onboarding v2 R1.11, `PrefsFlow`) shows the ones still unanswered one per screen, in the persona's order
 * and with the persona's rewrites (`lib/onboarding/persona.ts`). The answers are the same bio keys with the same strings
 * the extension fills into application forms; the retired `/welcome` wizard wrote them identically.
 */
export type PreferenceQuestion = {
  title: string;
  why: string;
  keys: string[];
};

export const PREFERENCE_QUESTIONS: PreferenceQuestion[] = [
  {
    title: "Are you legally authorized to work in the country you're applying in?",
    why: "Nearly every application asks. Answer once and Kiwiply fills it everywhere.",
    keys: ["authorizedToWork"],
  },
  {
    title: "Will you now or in the future need visa sponsorship?",
    why: "The usual follow-up to the question before.",
    keys: ["requireSponsorship"],
  },
  {
    title: "What salary are you looking for?",
    why: "Used where a form asks for your expected pay. You can change it any time, or set a different number on a single application.",
    keys: ["desiredSalary"],
  },
  {
    title: "How soon could you start?",
    why: "Your notice period — forms ask it as a start date, availability or notice.",
    keys: ["noticePeriod"],
  },
  {
    title: "How do you like to work?",
    why: "For the work-arrangement and relocation questions.",
    keys: ["workPreference", "willingToRelocate"],
  },
  {
    title: "Voluntary self-identification",
    why: "Optional. Many US applications ask these. Kiwiply fills them only where a form asks, and you review each one before it's written. Skipping is always fine.",
    keys: ["gender", "ethnicity", "race", "veteranStatus", "disabilityStatus"],
  },
];

export const EEO: { key: string; label: string; options: string[] }[] = [
  { key: "gender", label: "Gender", options: GENDERS },
  { key: "ethnicity", label: "Hispanic / Latino?", options: HISPANIC },
  { key: "race", label: "Race", options: RACES },
  { key: "veteranStatus", label: "Veteran status", options: VETERAN },
  { key: "disabilityStatus", label: "Disability status", options: DISABILITY },
];

export const ALL_PREFERENCE_KEYS = PREFERENCE_QUESTIONS.flatMap((q) => q.keys);

/** The questions whose every key is empty in `bio`. */
export function unansweredQuestions(bio: Record<string, unknown>): PreferenceQuestion[] {
  const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
  return PREFERENCE_QUESTIONS.filter((q) => !q.keys.some((k) => has(bio[k])));
}

/** The input(s) for one question. `idPrefix` keeps ids unique when several are on screen. */
export default function PreferenceInputs({
  question,
  answers,
  onChange,
  labelledBy,
  idPrefix = "welcome",
  onEnter,
  salaryHint,
}: {
  question: PreferenceQuestion;
  answers: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** Id of the element that holds the question text (names the choice groups). */
  labelledBy: string;
  idPrefix?: string;
  onEnter?: () => void;
  /** Replaces the hint under the salary box (a first job: "A range is fine, e.g. $45–55k"). */
  salaryHint?: string;
}) {
  const first = question.keys[0];
  if (first === "authorizedToWork" || first === "requireSponsorship") {
    return <ChoiceGroup aria-labelledby={labelledBy} options={YESNO} value={answers[first] ?? ""} onChange={(v) => onChange(first, v)} allowClear size="lg" />;
  }
  if (first === "desiredSalary") {
    return (
      <Field label="Desired salary" htmlFor={`${idPrefix}-salary`} hint={salaryHint ?? "Write it the way you'd say it, e.g. $120,000. A number-only box gets just the number."} className="mb-0 max-w-sm">
        <Input
          id={`${idPrefix}-salary`}
          value={answers.desiredSalary ?? ""}
          maxLength={LIMITS.name}
          placeholder="e.g. $120,000"
          onChange={(e) => onChange("desiredSalary", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
        />
      </Field>
    );
  }
  if (first === "noticePeriod") {
    return <ChoiceGroup aria-labelledby={labelledBy} options={NOTICE} value={answers.noticePeriod ?? ""} onChange={(v) => onChange("noticePeriod", v)} allowClear size="lg" columns={4} />;
  }
  if (first === "workPreference") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <div id={`${idPrefix}-pref`} className="mb-2 text-[12.5px] font-semibold text-ink-soft">I prefer to work</div>
          <ChoiceGroup aria-labelledby={`${idPrefix}-pref`} options={WORK_PREFERENCE} value={answers.workPreference ?? ""} onChange={(v) => onChange("workPreference", v)} allowClear size="lg" columns={3} />
        </div>
        <div>
          <div id={`${idPrefix}-relocate`} className="mb-2 text-[12.5px] font-semibold text-ink-soft">Open to relocating?</div>
          <ChoiceGroup aria-labelledby={`${idPrefix}-relocate`} options={YESNO} value={answers.willingToRelocate ?? ""} onChange={(v) => onChange("willingToRelocate", v)} allowClear size="lg" />
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
      {EEO.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`${idPrefix}-${f.key}`} className="mb-0">
          <Select id={`${idPrefix}-${f.key}`} aria-label={f.label} value={answers[f.key] ?? ""} onChange={(v) => onChange(f.key, v)}>
            <option value="">—</option>
            {f.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </Field>
      ))}
    </div>
  );
}
