"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Button, Stepper } from "@kiwiply/ui";
import type { Bio } from "@/components/BioEditor";
import { unansweredQuestions, ALL_PREFERENCE_KEYS } from "@/components/onboarding/preferences";
import { track } from "@/lib/analytics";
import { notifyExtension } from "@/lib/extension-signal";
import { fetchCompleteness, ItemApiError } from "@/lib/profile-items";
import { ONBOARDED_KEY } from "@/lib/profile-options";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import {
  buildImportBody,
  identityConflicts,
  keptItems,
  languageItems,
  planIdentity,
  postImport,
  putBio,
  skillItems,
} from "@/lib/profile-setup/import";
import type { SetupParse } from "@/lib/profile-setup/parse";
import {
  INITIAL_STATE,
  stepLabel,
  clearDraft,
  isResumable,
  keptCounts,
  loadDraft,
  nextStep,
  prevStep,
  reducer,
  saveDraft,
  stepsFor,
  type SetupPath,
  type SetupState,
} from "@/lib/profile-setup/state";
import type { BioLimits, IdentityKey } from "@/lib/profile-setup/draft";
import { initialFresh } from "@/lib/profile-setup/fresh";
import { sensitiveMessage, type DraftLimits } from "../itemSchema";
import FinishStep, { type FinishResult } from "./FinishStep";
import FreshFlow from "./FreshFlow";
import IdentityStep from "./IdentityStep";
import PasteStep from "./PasteStep";
import PathPicker from "./PathPicker";
import PreferencesStep from "./PreferencesStep";
import ReviewCards from "./ReviewCards";
import SensitiveNotice from "./SensitiveNotice";
import SkillsStep from "./SkillsStep";
import UploadStep from "./UploadStep";

const CARD = "rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-6";

/**
 * The profile setup wizard (`/profiles/setup`, Resume Builder R1.4): path picker, then Upload or Paste,
 * a card-by-card review, skills, an identity confirm card, the unanswered `/welcome` questions, and a
 * finish screen. NOTHING is written to the account until Finish: one `POST /api/profile/items/import`
 * (kept entries, skills, languages, confirmed identity) then one `PUT /api/profile` (preferences, typed
 * identity values, the onboarded flag). Abandoning keeps a draft in `sessionStorage` (parsed content
 * only, never the file or the text), offered again on the next visit.
 */
export default function ProfileSetup({
  bio,
  config,
  initialPath = null,
}: {
  /** The profile's flat bio as the page loaded it. */
  bio: Bio;
  config: ResumeBuilderConfig;
  initialPath?: SetupPath | null;
}) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE, (s) => (initialPath ? { ...s, path: initialPath, step: "input" as const } : s));
  const [resumed, setResumed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const ready = useRef(false);
  const lastStep = useRef<string>("");

  const fresh = state.path === "fresh";
  const questions = useMemo(() => unansweredQuestions(bio), [bio]);
  const steps = stepsFor(state, questions.length > 0);
  const limits: DraftLimits = { bullets: config.limits.bullets, bulletChars: config.limits.bulletChars };
  const bioLimits: BioLimits = useMemo(
    () => ({ valueChars: config.profile.bioValueMaxChars, summaryChars: config.profile.bioSummaryMaxChars }),
    [config.profile.bioValueMaxChars, config.profile.bioSummaryMaxChars],
  );

  // Offer a draft left in this tab. Read after mount so the server and first client render agree.
  useEffect(() => {
    const draft = loadDraft(window.sessionStorage);
    if (draft && !initialPath) {
      dispatch({ type: "restore", state: draft });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists on the client
      setResumed(true);
    }
    ready.current = true;
  }, [initialPath]);

  useEffect(() => {
    if (ready.current && state.step !== "done") saveDraft(window.sessionStorage, state);
  }, [state]);

  useEffect(() => {
    if (state.step === lastStep.current) return;
    lastStep.current = state.step;
    if (state.step !== "path") track("profile_setup_step", { step: state.step });
  }, [state.step]);

  const go = (step: SetupState["step"]) => {
    setError(null);
    dispatch({ type: "goto", step });
  };
  const next = () => go(nextStep(state, questions.length > 0));
  const back = () => go(prevStep(state, questions.length > 0));
  const startOver = () => {
    clearDraft(window.sessionStorage);
    setResumed(false);
    setError(null);
    dispatch({ type: "reset" });
  };

  const onParsed = (p: SetupParse) => {
    track("profile_setup_parsed", { source: p.source, cards: p.draft.candidates.length, skills: p.draft.skills.length, removed: p.removed });
    dispatch({ type: "parsed", draft: p.draft, source: p.source, removed: p.removed, existing: bio, typed: p.typed });
  };

  const pick = (path: SetupPath) => {
    track("profile_setup_started", { path });
    dispatch({ type: "path", path });
  };

  const parsed = state.parsed;
  const conflicts = useMemo(() => identityConflicts(parsed?.parsedIdentity ?? {}, bio), [parsed, bio]);
  const counts = keptCounts(state);
  const skillList = state.skills;

  const finish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const plan = planIdentity(state.identity, parsed?.parsedIdentity ?? {}, bio, bioLimits);
      // What the person answered themselves is theirs ("user"); what was read out of a resume is "parsed".
      const provenance = parsed?.source === "fresh" ? ("USER" as const) : ("PARSED" as const);
      const items = [...keptItems(parsed?.candidates ?? [], state.decisions, state.edits, provenance), ...skillItems(state.skills, provenance), ...languageItems(state.languages, provenance)];
      let added = 0;
      if (!state.imported) {
        if (items.length > config.profile.maxImportItems) {
          setError(`That's ${items.length} entries and one setup can hold ${config.profile.maxImportItems}. Go back and skip a few; you can add the rest from your profile.`);
          return;
        }
        if (items.length > 0 || Object.keys(plan.fromResume).length > 0) {
          const r = await postImport(buildImportBody(items, plan.fromResume));
          added = (r?.created ?? 0) + (r?.merged ?? 0);
        }
        dispatch({ type: "imported" });
      }
      // The client owns the merge: everything the import wrote must be in the payload, or this PUT would drop it.
      const merged: Bio = { ...bio, ...plan.fromResume, ...plan.fromUser };
      for (const k of ALL_PREFERENCE_KEYS) {
        const v = (state.prefs[k] ?? "").trim();
        if (v) merged[k] = v;
      }
      merged[ONBOARDED_KEY] = new Date().toISOString();
      await putBio(merged);

      const completeness = await fetchCompleteness().catch(() => null);
      clearDraft(window.sessionStorage);
      notifyExtension("changed");
      track("profile_setup_completed", { items: items.length, score: completeness?.score ?? null });
      setResult({ added: added || items.length, removed: parsed?.removed ?? 0, completeness });
      dispatch({ type: "goto", step: "done" });
    } catch (e) {
      setError(finishError(e));
    } finally {
      setSaving(false);
    }
  }, [state, parsed, bio, config.profile.maxImportItems, bioLimits]);

  const lastDataStep = steps[steps.length - 2];
  const onLast = state.step === lastDataStep;
  const currentIndex = Math.max(0, steps.indexOf(state.step));

  const footer = (
    <div className="mt-6 flex flex-col gap-3">
      {onLast && (
        <p className="text-[13px] text-v2-ink-soft" data-testid="summary">
          {summaryLine(counts, skillList.length)}
        </p>
      )}
      {onLast && parsed && <SensitiveNotice removed={parsed.removed} />}
      {error && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={back} disabled={saving} className="max-sm:min-h-11">
          Back
        </Button>
        {onLast ? (
          <Button variant="accent" onClick={() => void finish()} disabled={saving} className="max-sm:min-h-11">
            {saving ? "Saving…" : state.imported ? "Try again" : "Finish"}
          </Button>
        ) : (
          <Button variant="accent" onClick={next} className="max-sm:min-h-11">
            Continue
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-v2-navy">Build your profile</h1>
          <p className="mt-0.5 text-[14px] text-v2-ink-soft">
            {fresh ? "Answer a few questions and confirm what you told us." : "Confirm what we find in your resume."} Nothing is saved until you finish.
          </p>
        </div>
        {state.step !== "done" && (
          <Link href="/profiles" className="flex-none text-[13px] font-semibold text-v2-muted hover:text-ink hover:underline max-sm:flex max-sm:min-h-11 max-sm:items-center">
            Exit
          </Link>
        )}
      </header>

      <Stepper label="Profile setup progress" steps={steps.map((k) => ({ key: k, label: stepLabel(k, state.path) }))} current={currentIndex} />

      {resumed && isResumable(state) && state.step !== "done" && (
        <p role="status" className="rounded-xl bg-paper-2 px-3 py-2 text-[13px] text-v2-ink-soft">
          Picked up where you left off.{" "}
          <button type="button" onClick={startOver} className="font-semibold text-v2-blue hover:underline">
            Start over
          </button>
        </p>
      )}

      <section aria-label={stepLabel(state.step, state.path)} className={CARD}>
        {state.step === "path" && <PathPicker onPick={pick} freshEnabled onFresh={() => pick("fresh")} />}

        {state.step === "input" && state.path === "upload" && <UploadStep onParsed={onParsed} onBack={() => go("path")} maxBytes={config.profile.uploadMaxBytes} bioLimits={bioLimits} />}
        {state.step === "input" && state.path === "paste" && <PasteStep onParsed={onParsed} onBack={() => go("path")} bioLimits={bioLimits} />}
        {state.step === "input" && fresh && (
          <FreshFlow
            fresh={state.fresh ?? initialFresh()}
            dispatch={(action) => dispatch({ type: "fresh", action })}
            bioLimits={bioLimits}
            bulletChars={config.limits.bulletChars}
            onDone={onParsed}
            onBack={() => go("path")}
          />
        )}

        {state.step === "cards" && parsed && (
          <>
            {parsed.removed > 0 && (
              <div className="mb-4">
                <SensitiveNotice removed={parsed.removed} />
              </div>
            )}
            <ReviewCards
              candidates={parsed.candidates}
              decisions={state.decisions}
              edits={state.edits}
              cursor={state.cursor}
              limits={limits}
              onDecide={(id, decision) => dispatch({ type: "decide", id, decision })}
              onEdit={(id, data) => dispatch({ type: "edit", id, data })}
              onCursor={(cursor) => dispatch({ type: "cursor", cursor })}
              onKeepRemaining={() => dispatch({ type: "decideAll", decision: "keep" })}
              onDone={next}
              provenance={parsed.source === "fresh" ? "USER" : "PARSED"}
            />
          </>
        )}

        {state.step === "skills" && parsed && (
          <>
            <SkillsStep
              skills={state.skills}
              suggestions={[...parsed.skills, ...parsed.suggestions]}
              languages={state.languages}
              onSkills={(s) => dispatch({ type: "skills", skills: s })}
              onLanguages={(l) => dispatch({ type: "languages", languages: l })}
              suggestionsTitle={parsed.source === "fresh" ? "Suggested for you" : undefined}
            />
            {footer}
          </>
        )}

        {state.step === "identity" && parsed && (
          <>
            <IdentityStep
              values={state.identity}
              conflicts={conflicts}
              onChange={(key: IdentityKey, value: string) => dispatch({ type: "identity", key, value })}
            />
            {footer}
          </>
        )}

        {state.step === "prefs" && (
          <>
            <PreferencesStep questions={questions} answers={state.prefs} onChange={(key, value) => dispatch({ type: "pref", key, value })} />
            {footer}
          </>
        )}

        {state.step === "done" && result && <FinishStep result={result} />}
      </section>
    </div>
  );
}

/** "Adding 3 roles, 1 school, 2 projects and 14 skills." */
export function summaryLine(counts: { EXPERIENCE: number; EDUCATION: number; PROJECT: number }, skills: number): string {
  const part = (n: number, one: string, many: string) => (n > 0 ? `${n} ${n === 1 ? one : many}` : "");
  const parts = [
    part(counts.EXPERIENCE, "role", "roles"),
    part(counts.EDUCATION, "school", "schools"),
    part(counts.PROJECT, "project", "projects"),
    part(skills, "skill", "skills"),
  ].filter(Boolean);
  if (parts.length === 0) return "Nothing to add to your profile yet. You can finish now and add things from your profile.";
  const last = parts.pop() as string;
  return `Adding ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last} to your profile.`;
}

function finishError(e: unknown): string {
  if (e instanceof ItemApiError) {
    if (e.code === "SENSITIVE_CONTENT") return `${sensitiveMessage(e.cls ?? "")} It is in one of your entries; go back to the review and remove it.`;
    if (e.code === "ITEM_LIMIT") return e.limit ? `Your profile can hold ${e.limit} entries. Skip some entries, or delete old ones from your profile.` : e.message;
    if (e.code === "ITEM_TOO_LARGE") return "One of your entries is too long. Go back and shorten it.";
    return e.message;
  }
  return "Something went wrong while saving. Try again.";
}
