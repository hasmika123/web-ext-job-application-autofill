"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Button, Stepper, useToast } from "@kiwiply/ui";
import type { Bio } from "@/components/BioEditor";
import { unansweredQuestions, ALL_PREFERENCE_KEYS } from "@/components/onboarding/preferences";
import { track } from "@/lib/analytics";
import { notifyExtension } from "@/lib/extension-signal";
import { fetchCompleteness, ItemApiError } from "@/lib/profile-items";
import { finishOnboarding, type OnboardingStatus } from "@/lib/onboarding/api";
import useDraftSync, { type SyncError } from "@/lib/onboarding/useDraftSync";
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
  isResumable,
  keptCounts,
  nextStep,
  prevStep,
  reducer,
  stepsFor,
  withProgress,
  type SetupPath,
  type SetupState,
} from "@/lib/profile-setup/state";
import type { BioLimits, IdentityKey } from "@/lib/profile-setup/draft";
import { initialFresh } from "@/lib/profile-setup/fresh";
import { sensitiveMessage, type DraftLimits } from "../itemSchema";
import ConflictBanner from "./ConflictBanner";
import FinishStep, { type FinishResult } from "./FinishStep";
import FreshFlow from "./FreshFlow";
import IdentityStep from "./IdentityStep";
import PasteStep from "./PasteStep";
import PathPicker from "./PathPicker";
import PreferencesStep from "./PreferencesStep";
import ResumeBanner from "./ResumeBanner";
import ReviewCards from "./ReviewCards";
import SaveStatusPill from "./SaveStatusPill";
import SensitiveNotice from "./SensitiveNotice";
import SkillsStep from "./SkillsStep";
import UploadStep from "./UploadStep";

const CARD = "rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-6";

/**
 * The profile setup wizard (`/profiles/setup`, Resume Builder R1.4): path picker, then Upload or Paste,
 * a card-by-card review, skills, an identity confirm card, the unanswered `/welcome` questions, and a
 * finish screen. NOTHING is written to the profile until Finish: one `POST /api/profile/items/import`
 * (kept entries, skills, languages, confirmed identity) then one `PUT /api/profile` (preferences, typed
 * identity values, the onboarded flag).
 *
 * Progress is never lost (Onboarding v2 R1.9, DESIGN 7): every change goes into a local mirror at once and a
 * server-side draft shortly after (`useDraftSync`: parsed content only, never the file or the text), so a
 * reload, another device or a dropped connection picks up where the person left off. The quiet status pill, the
 * "picked up" line and the conflict choice are the only autosave UI; there is no Save button.
 */
export default function ProfileSetup({
  bio,
  config,
  initialPath = null,
  initialStep = null,
  server = null,
  login = "",
}: {
  /** The profile's flat bio as the page loaded it. */
  bio: Bio;
  config: ResumeBuilderConfig;
  initialPath?: SetupPath | null;
  /** `?step=prefs` (the retired `/welcome` lands here): open on the application questions when any are unanswered. */
  initialStep?: "prefs" | null;
  /** `GET /api/profile/onboarding?include=state` as the page loaded it; null when the API could not be reached. */
  server?: OnboardingStatus | null;
  /** Whoever is signed in: the local mirror is only offered back to the same login. */
  login?: string;
}) {
  const toast = useToast();
  // A deep link (`?path=` / `?step=prefs`) only sets where a NEW run starts: a saved draft is never replaced by it.
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE, (s) => {
    if (initialPath) return { ...s, path: initialPath, step: "source" as const };
    if (initialStep === "prefs" && unansweredQuestions(bio).length > 0) return { ...s, step: "prefs" as const };
    return s;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const lastStep = useRef<string>("");

  const fresh = state.path === "fresh";
  const questions = useMemo(() => unansweredQuestions(bio), [bio]);
  const hasPrefQuestions = questions.length > 0;
  // Arriving on the questions with nothing parsed (the `/welcome` link): just the questions, then done.
  const prefsOnly = state.step === "prefs" && !state.parsed;
  const steps = prefsOnly ? (["prefs", "done"] as SetupState["step"][]) : stepsFor(state, hasPrefQuestions);
  const limits: DraftLimits = { bullets: config.limits.bullets, bulletChars: config.limits.bulletChars };
  const bioLimits: BioLimits = useMemo(
    () => ({ valueChars: config.profile.bioValueMaxChars, summaryChars: config.profile.bioSummaryMaxChars }),
    [config.profile.bioValueMaxChars, config.profile.bioSummaryMaxChars],
  );

  // The state as it is saved: with "n of total done" and how far through the step (DESIGN 3.1).
  const synced = useMemo(() => withProgress(state, hasPrefQuestions, questions.length), [state, hasPrefQuestions, questions.length]);
  const sync = useDraftSync({ state: synced, login, server, onHydrate: (s) => dispatch({ type: "hydrate", state: s }) });

  // A refusal of the draft itself (too large, a value we never store): tell the person once, in words.
  useEffect(() => {
    if (!sync.error) return;
    toast({ title: syncMessage(sync.error), variant: "error" });
    sync.clearError();
  }, [sync, toast]);

  useEffect(() => {
    if (state.step === lastStep.current) return;
    lastStep.current = state.step;
    if (state.step !== "hello" && !(state.step === "source" && !state.path)) track("profile_setup_step", { step: state.step });
  }, [state.step, state.path]);

  const go = (step: SetupState["step"]) => {
    setError(null);
    dispatch({ type: "goto", step });
  };
  const toPicker = () => {
    setError(null);
    dispatch({ type: "backToPath" });
  };
  const next = () => go(nextStep(state, hasPrefQuestions));
  const back = () => {
    const to = prevStep(state, hasPrefQuestions);
    if (prefsOnly || to === "hello") toPicker();
    else go(to);
  };
  const startOver = async () => {
    setError(null);
    setSyncBusy(true);
    await sync.startOver();
    dispatch({ type: "reset" });
    setSyncBusy(false);
  };
  const takeTheirs = async () => {
    setSyncBusy(true);
    await sync.acceptServer();
    setSyncBusy(false);
  };
  const keepMine = async () => {
    setSyncBusy(true);
    await sync.keepMine();
    setSyncBusy(false);
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
      notifyExtension("changed");
      track("profile_setup_completed", { items: items.length, score: completeness?.score ?? null });
      // Confirmed: stop drafting (a late save must not bring the draft back), then let the server stamp finishedAt and
      // drop it. Best effort: the profile is saved either way, and an unfinished flag only means the card shows once more.
      sync.finished();
      await finishOnboarding().catch(() => null);
      setResult({ added: added || items.length, removed: parsed?.removed ?? 0, completeness });
      dispatch({ type: "coreConfirmed" });
      dispatch({ type: "goto", step: "done" });
    } catch (e) {
      setError(finishError(e));
    } finally {
      setSaving(false);
    }
  }, [state, parsed, bio, config.profile.maxImportItems, bioLimits, sync]);

  const lastDataStep = steps[steps.length - 2];
  const onLast = state.step === lastDataStep;
  // The v1 stepper has no "who you are" step (that screen arrives with the new shell, R1.10).
  const stepperSteps = steps.filter((k) => k !== "hello");
  const currentIndex = Math.max(0, stepperSteps.indexOf(state.step === "hello" ? "source" : state.step));
  const showPicker = state.step === "hello" || (state.step === "source" && state.path === null);
  const inSource = state.step === "source" && state.path !== null;
  const resumed = sync.resumed;

  const footer = (
    <div className="mt-6 flex flex-col gap-3">
      {onLast && !prefsOnly && (
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
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="font-display text-[26px] font-extrabold text-v2-navy">Build your profile</h1>
          <p className="mt-0.5 text-[14px] text-v2-ink-soft">
            {fresh ? "Answer a few questions and confirm what you told us." : "Confirm what we find in your resume."} Your progress is saved as you go.
          </p>
        </div>
        {/* the status sits above the title on a phone, so a long "Offline — saved on this device" never squeezes it */}
        <div className="flex flex-none flex-wrap items-center justify-end gap-x-3 gap-y-1 max-sm:order-first max-sm:basis-full">
          <SaveStatusPill status={sync.status} reason={sync.reason} onRetry={sync.retry} />
          {state.step !== "done" && (
            <Link href="/profiles" aria-label="Exit setup — your progress is saved" className="text-[13px] font-semibold text-v2-muted hover:text-ink hover:underline max-sm:flex max-sm:min-h-11 max-sm:items-center">
              Exit
            </Link>
          )}
        </div>
      </header>

      <Stepper label="Profile setup progress" steps={stepperSteps.map((k) => ({ key: k, label: stepLabel(k, state.path) }))} current={currentIndex} />

      {sync.conflict && <ConflictBanner onUseThat={() => void takeTheirs()} onKeepMine={() => void keepMine()} busy={syncBusy} />}

      {resumed && resumed.step === state.step && isResumable(state) && state.step !== "done" && <ResumeBanner resumed={resumed} onStartOver={() => void startOver()} busy={syncBusy} />}

      {sync.ready && (
        <section aria-label={stepLabel(state.step === "hello" ? "source" : state.step, state.path)} className={CARD}>
          {showPicker && <PathPicker onPick={pick} freshEnabled onFresh={() => pick("fresh")} />}

          {inSource && state.path === "upload" && <UploadStep onParsed={onParsed} onBack={toPicker} maxBytes={config.profile.uploadMaxBytes} bioLimits={bioLimits} />}
          {inSource && state.path === "paste" && <PasteStep onParsed={onParsed} onBack={toPicker} bioLimits={bioLimits} />}
          {inSource && fresh && (
            <FreshFlow
              fresh={state.fresh ?? initialFresh()}
              dispatch={(action) => dispatch({ type: "fresh", action })}
              bioLimits={bioLimits}
              bulletChars={config.limits.bulletChars}
              onDone={onParsed}
              onBack={toPicker}
            />
          )}

          {state.step === "review" && parsed && (
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

          {state.step === "you" && parsed && (
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
      )}
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

/** What a refused draft save says (DESIGN 5.13): in words, with the way out. */
export function syncMessage(e: SyncError): string {
  if (e.code === "DRAFT_TOO_LARGE") return "That's more than we can hold in one setup — skip a few entries.";
  if (e.code === "SENSITIVE_CONTENT") return `${sensitiveMessage(e.cls ?? "")} It's in one of your entries; edit the card.`;
  return "Couldn't save your progress to your account. It's kept on this device.";
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
