"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { notifyExtension } from "@/lib/extension-signal";
import { type Bio, ONBOARDED_KEY } from "@/lib/profile-options";
import PreferenceInputs, { ALL_PREFERENCE_KEYS, PREFERENCE_QUESTIONS } from "./preferences";

/**
 * Onboarding — Tier A of the self-building profile (Phase 10.3b).
 *
 * Only what a resume can't say and an application always asks: work authorization,
 * sponsorship, salary, notice, how you like to work — and EEO self-ID, which is offered but
 * never required. One question per screen; every question can be skipped, and "Skip for now"
 * is always on screen. Each step saves as you go, so leaving halfway keeps what you answered.
 * Finishing or skipping marks the profile onboarded, and the dashboard stops sending you here.
 */

const STEPS = PREFERENCE_QUESTIONS;
const ALL_KEYS = ALL_PREFERENCE_KEYS;

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
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)] sm:p-8">
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
    <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)] sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-muted">
          Question {step + 1} of {STEPS.length}
        </span>
        <button
          type="button"
          onClick={() => void skipForNow()}
          disabled={saving}
          className="-my-3 min-h-11 px-1 text-[12.5px] font-semibold text-muted hover:text-ink hover:underline disabled:opacity-50 sm:-my-0 sm:min-h-0"
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
        <PreferenceInputs question={s} answers={answers} onChange={set} labelledBy={titleId} onEnter={() => void next()} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">{error}</p>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 0 || saving}
          className={cn(buttonVariants("ghost"), "min-h-11 sm:min-h-0", step === 0 && "invisible")}
        >
          Back
        </button>
        <button type="button" onClick={() => void next()} disabled={saving} className={cn(buttonVariants("accent"), "min-h-11 sm:min-h-0")}>
          {saving ? "Saving…" : step === STEPS.length - 1 ? "Finish" : answered ? "Next" : "Skip this one"}
        </button>
      </div>
    </div>
  );
}
