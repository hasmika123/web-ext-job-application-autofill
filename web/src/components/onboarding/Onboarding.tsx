"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input, Field, Select, ChoiceGroup } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { LIMITS } from "@/lib/validate";
import { notifyExtension } from "@/lib/extension-signal";
import {
  type Bio, YESNO, NOTICE, WORK_PREFERENCE, GENDERS, HISPANIC, RACES, VETERAN, DISABILITY, ONBOARDED_KEY,
} from "@/lib/profile-options";

/**
 * Onboarding — Tier A of the self-building profile (Phase 10.3b).
 *
 * Only what a resume can't say and an application always asks: work authorization,
 * sponsorship, salary, notice, how you like to work — and EEO self-ID, which is offered but
 * never required. One question per screen; every question can be skipped, and "Skip for now"
 * is always on screen. Each step saves as you go, so leaving halfway keeps what you answered.
 * Finishing or skipping marks the profile onboarded, and the dashboard stops sending you here.
 */

type Step = {
  title: string;
  why: string;
  keys: string[];
};

const STEPS: Step[] = [
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

const EEO: { key: string; label: string; options: string[] }[] = [
  { key: "gender", label: "Gender", options: GENDERS },
  { key: "ethnicity", label: "Hispanic / Latino?", options: HISPANIC },
  { key: "race", label: "Race", options: RACES },
  { key: "veteranStatus", label: "Veteran status", options: VETERAN },
  { key: "disabilityStatus", label: "Disability status", options: DISABILITY },
];

const ALL_KEYS = STEPS.flatMap((s) => s.keys);

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export default function Onboarding({ initialBio, hasResume }: { initialBio: Bio; hasResume: boolean }) {
  const router = useRouter();
  // What the server holds now — each save merges over it, so keys we don't manage survive.
  const base = useRef<Bio>(initialBio);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(ALL_KEYS.map((k) => [k, asString(initialBio[k])])),
  );
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = step >= STEPS.length;

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  /** Merge the answers over the saved bio and PUT it. */
  async function save(markOnboarded: boolean): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const merged: Bio = { ...base.current };
      for (const k of ALL_KEYS) {
        const v = (answers[k] ?? "").trim();
        if (v) merged[k] = v;
        else delete merged[k];
      }
      if (markOnboarded) merged[ONBOARDED_KEY] = new Date().toISOString();
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: JSON.stringify(merged) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your answers. Please try again.");
        return false;
      }
      base.current = merged;
      if (markOnboarded) notifyExtension("changed");
      return true;
    } catch {
      setError("Something went wrong while saving. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    const last = step === STEPS.length - 1;
    if (await save(last)) setStep(step + 1);
  }

  async function skipForNow() {
    if (await save(true)) router.push("/dashboard");
  }

  if (done) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)] sm:p-8">
        <h2 className="font-display text-2xl font-semibold text-ink">You&apos;re set.</h2>
        <p className="mt-2 text-[14px] text-ink-soft">
          Kiwiply will fill these answers on every application. You can change any of them on your{" "}
          <Link href="/profile#preferences" className="font-semibold text-accent-deep hover:underline">profile</Link>.
        </p>
        {!hasResume && (
          <p className="mt-4 text-[14px] text-ink-soft">
            Next, add your resume. It fills your name, contact details, work history and education, so there&apos;s
            nothing else to type.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {hasResume ? (
            <Link href="/dashboard" className={buttonVariants("accent")}>Go to your dashboard</Link>
          ) : (
            <>
              <Link href="/resumes" className={buttonVariants("accent")}>Upload your resume</Link>
              <Link href="/dashboard" className={buttonVariants("ghost")}>Later</Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const s = STEPS[step];
  const titleId = `welcome-q${step}`;
  const answered = s.keys.some((k) => (answers[k] ?? "").trim());

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)] sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-muted">
          Question {step + 1} of {STEPS.length}
        </span>
        <button
          type="button"
          onClick={() => void skipForNow()}
          disabled={saving}
          className="text-[12.5px] font-semibold text-muted hover:text-ink hover:underline disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2"
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={0}
        aria-valuemax={STEPS.length}
        aria-valuenow={step}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(step / STEPS.length) * 100}%` }} />
      </div>

      <h2 id={titleId} className="mt-6 font-display text-xl font-semibold text-ink">{s.title}</h2>
      <p className="mt-1.5 text-[13.5px] text-muted">{s.why}</p>

      <div className="mt-5">
        {s.keys[0] === "authorizedToWork" || s.keys[0] === "requireSponsorship" ? (
          <ChoiceGroup aria-labelledby={titleId} options={YESNO} value={answers[s.keys[0]]} onChange={(v) => set(s.keys[0], v)} allowClear />
        ) : s.keys[0] === "desiredSalary" ? (
          <Field label="Desired salary" htmlFor="welcome-salary" hint="Write it the way you'd say it, e.g. $120,000. A number-only box gets just the number." className="mb-0 max-w-sm">
            <Input
              id="welcome-salary"
              value={answers.desiredSalary}
              maxLength={LIMITS.name}
              placeholder="e.g. $120,000"
              onChange={(e) => set("desiredSalary", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void next();
              }}
            />
          </Field>
        ) : s.keys[0] === "noticePeriod" ? (
          <ChoiceGroup aria-labelledby={titleId} options={NOTICE} value={answers.noticePeriod} onChange={(v) => set("noticePeriod", v)} allowClear />
        ) : s.keys[0] === "workPreference" ? (
          <div className="flex flex-col gap-5">
            <div>
              <div id="welcome-pref" className="mb-2 text-[12.5px] font-semibold text-ink-soft">I prefer to work</div>
              <ChoiceGroup aria-labelledby="welcome-pref" options={WORK_PREFERENCE} value={answers.workPreference} onChange={(v) => set("workPreference", v)} allowClear />
            </div>
            <div>
              <div id="welcome-relocate" className="mb-2 text-[12.5px] font-semibold text-ink-soft">Open to relocating?</div>
              <ChoiceGroup aria-labelledby="welcome-relocate" options={YESNO} value={answers.willingToRelocate} onChange={(v) => set("willingToRelocate", v)} allowClear />
            </div>
          </div>
        ) : (
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            {EEO.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`welcome-${f.key}`} className="mb-0">
                <Select id={`welcome-${f.key}`} aria-label={f.label} value={answers[f.key]} onChange={(v) => set(f.key, v)}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">{error}</p>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 0 || saving}
          className={cn(buttonVariants("ghost"), step === 0 && "invisible")}
        >
          Back
        </button>
        <button type="button" onClick={() => void next()} disabled={saving} className={buttonVariants("accent")}>
          {saving ? "Saving…" : step === STEPS.length - 1 ? "Finish" : answered ? "Next" : "Skip this one"}
        </button>
      </div>
    </div>
  );
}
