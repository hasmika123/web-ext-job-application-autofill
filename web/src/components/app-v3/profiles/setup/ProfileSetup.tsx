"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Button, useToast } from "@kiwiply/ui";
import type { Bio } from "@/components/BioEditor";
import { unansweredQuestions, ALL_PREFERENCE_KEYS } from "@/components/onboarding/preferences";
import { track } from "@/lib/analytics";
import { notifyExtension } from "@/lib/extension-signal";
import { fetchCompleteness, ItemApiError } from "@/lib/profile-items";
import { finishOnboarding, patchOnboarding, type OnboardingStatus } from "@/lib/onboarding/api";
import { freshGoalFor } from "@/lib/onboarding/persona";
import { barLabel, barValueText, secondsRemaining } from "@/lib/onboarding/progress";
import useDraftSync, { type SyncError } from "@/lib/onboarding/useDraftSync";
import { ONBOARDED_KEY } from "@/lib/profile-options";
import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
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
  isResumable,
  keptCounts,
  nextStep,
  reducer,
  stepsFor,
  withProgress,
  type Persona,
  type SetupPath,
  type SetupState,
  type StepKey,
} from "@/lib/profile-setup/state";
import type { BioLimits, IdentityKey } from "@/lib/profile-setup/draft";
import { initialFresh } from "@/lib/profile-setup/fresh";
import { summaryLine } from "@/lib/profile-setup/summary";
import { sensitiveMessage, type DraftLimits } from "../itemSchema";
import ConflictBanner from "./ConflictBanner";
import FinishStep, { type FinishResult } from "./FinishStep";
import FreshFlow from "./FreshFlow";
import IdentityStep from "./IdentityStep";
import OnboardingShell from "./OnboardingShell";
import PasteStep from "./PasteStep";
import PersonaStep from "./PersonaStep";
import PreferencesStep from "./PreferencesStep";
import ProfileSoFar from "./ProfileSoFar";
import ResumeBanner from "./ResumeBanner";
import ReviewScreen from "./ReviewScreen";
import SkillsStep from "./SkillsStep";
import SourceStep from "./SourceStep";
import { SkipButton, StepFooter } from "./parts";

export { summaryLine };

/** Where a run came from (DESIGN 12 `onboarding_started.entry`). */
export type SetupEntry = "card" | "chooser" | "profiles" | "welcome" | "ext" | "direct";

/**
 * The profile setup flow (`/profiles/setup`; Resume Builder R1.4, Onboarding v2 R1.10): one question or one card per
 * screen under a single thin progress bar. `hello` (who you are) -> `source` (upload is the hero) -> `review` (one card per
 * screen, then the recap) -> `skills` -> `you` ("Save my profile", the core confirm) -> the application questions -> done.
 *
 * Everything the person does is autosaved as a server-side draft (`useDraftSync`: parsed content only, never the file or the
 * text), so a reload, another device or a dropped connection picks up where they left off; the quiet pill in the top bar and
 * the "picked up" line are the only autosave UI, and there is no Save button. NOTHING reaches the profile until a confirm
 * point: the core confirm on `you` is one `POST /api/profile/items/import` (kept entries, skills, languages, confirmed
 * identity) then one `PUT /api/profile`; the questions are written per answer.
 */
export default function ProfileSetup({
  bio,
  config,
  initialPath = null,
  initialStep = null,
  server = null,
  login = "",
  firstName = "",
  entry = "direct",
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
  /** For "Hey Priya": the profile's, else the account's, first name. */
  firstName?: string;
  /** Where this run came from (analytics only). */
  entry?: SetupEntry;
}) {
  const toast = useToast();
  const ob = config.onboarding ?? DEFAULT_BUILDER_CONFIG.onboarding;
  const questions = useMemo(() => unansweredQuestions(bio), [bio]);
  const hasPrefQuestions = questions.length > 0;

  // A deep link (`?path=` / `?step=prefs`) only sets where a NEW run starts: a saved draft is never replaced by it. The `hello`
  // screen comes first until there is a persona (or the admin turned it off).
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE, (s): SetupState => {
    const persona = server?.persona ?? null;
    const base: SetupState = { ...s, persona };
    const first: StepKey = ob.personaStep && persona === null ? "hello" : "source";
    if (initialStep === "prefs" && hasPrefQuestions) return { ...base, step: "prefs" };
    if (initialPath) return { ...base, path: initialPath, step: first };
    return { ...base, step: first };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [personaPick, setPersonaPick] = useState<Persona | null>(null);
  const [personaOverlay, setPersonaOverlay] = useState(false);
  const [soFar, setSoFar] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const enteredAt = useRef(0);
  // The least time left the bar has shown: the estimate only ever goes down (DESIGN 5.0).
  const [lowest, setLowest] = useState(Number.POSITIVE_INFINITY);
  const started = useRef(false);
  /** The profile as the last confirm left it: every later write merges into this, never into the stale page copy. */
  const bioRef = useRef<Bio>(bio);
  const addedRef = useRef(0);

  const parsed = state.parsed;
  const fresh = state.path === "fresh";
  // Arriving on the questions with nothing parsed (the `/welcome` link): just the questions, then done.
  const prefsOnly = state.step === "prefs" && !parsed;
  const steps: StepKey[] = prefsOnly ? ["prefs", "done"] : stepsFor(state, hasPrefQuestions);
  const limits: DraftLimits = { bullets: config.limits.bullets, bulletChars: config.limits.bulletChars };
  const bioLimits: BioLimits = useMemo(
    () => ({ valueChars: config.profile.bioValueMaxChars, summaryChars: config.profile.bioSummaryMaxChars }),
    [config.profile.bioValueMaxChars, config.profile.bioSummaryMaxChars],
  );

  // The state as it is saved: with "n of total done" and how far through the step (DESIGN 3.1).
  const synced = useMemo(() => withProgress(state, hasPrefQuestions, questions.length), [state, hasPrefQuestions, questions.length]);
  const sync = useDraftSync({
    state: synced,
    login,
    server,
    onHydrate: (s) => dispatch({ type: "hydrate", state: { ...s, persona: s.persona ?? server?.persona ?? null } }),
  });

  // A refusal of the draft itself (too large, a value we never store): tell the person once, in words.
  useEffect(() => {
    if (!sync.error) return;
    toast({ title: syncMessage(sync.error), variant: "error" });
    sync.clearError();
  }, [sync, toast]);

  // How long the person spent on a step, for `onboarding_step_completed`.
  useEffect(() => {
    enteredAt.current = Date.now();
  }, [state.step]);

  // The first screen of a run with no draft behind it (a resumed run fires `onboarding_resumed` instead).
  useEffect(() => {
    if (!sync.ready || started.current) return;
    started.current = true;
    if (sync.resumed) return;
    track("onboarding_started", { entry, ...(state.persona ? { persona: state.persona } : {}) });
    // once per mount, with the persona the run began with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.ready]);

  const personaScreen = state.step === "hello" || personaOverlay;
  const stepIndex = Math.max(0, steps.indexOf(state.step));
  const completed = (skipped: boolean, extra: Record<string, number> = {}) =>
    track("onboarding_step_completed", { step: state.step, index: stepIndex + 1, total: steps.length, skipped, seconds: Math.round((Date.now() - enteredAt.current) / 1000), ...extra });

  const go = (step: StepKey) => {
    setError(null);
    setDirection("forward");
    setSoFar(false);
    dispatch({ type: "goto", step });
  };
  const next = () => go(nextStep(state, hasPrefQuestions));
  /** Finish the screen on show and move on. */
  const advance = (skipped = false, extra: Record<string, number> = {}) => {
    completed(skipped, extra);
    next();
  };

  const startOver = async () => {
    setError(null);
    setSyncBusy(true);
    await sync.startOver();
    dispatch({ type: "reset" });
    if (ob.personaStep && state.persona === null) dispatch({ type: "goto", step: "hello" });
    setPersonaOverlay(false);
    setSoFar(false);
    setLowest(Number.POSITIVE_INFINITY);
    setDirection("back");
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

  // ---- persona ------------------------------------------------------------------------------
  const choosePersona = (p: Persona | null) => {
    const changed = state.persona !== null && state.persona !== p;
    track("onboarding_persona_set", { persona: p ?? "skipped", changed });
    if (p !== null && p !== state.persona) {
      dispatch({ type: "persona", persona: p });
      // The server keeps it with the profile's markers; the draft carries it too, so a failure here is not lost.
      patchOnboarding({ persona: p }).catch(() => undefined);
    }
    setPersonaPick(null);
    if (personaOverlay) {
      setPersonaOverlay(false);
      setDirection("back");
    } else {
      completed(p === null);
      next();
    }
  };

  // ---- the way in -----------------------------------------------------------------------------
  const choosePath = (path: SetupPath) => {
    track("onboarding_path_chosen", { path, persona: state.persona ?? "none" });
    setDirection("forward");
    dispatch({ type: "path", path });
  };
  const skipSource = () => {
    track("onboarding_path_chosen", { path: "skip", persona: state.persona ?? "none" });
    completed(true);
    setDirection("forward");
    dispatch({ type: "skipSource", existing: bio });
  };
  const onParsed = (p: SetupParse) => {
    track("profile_setup_parsed", { source: p.source, cards: p.draft.candidates.length, skills: p.draft.skills.length, removed: p.removed });
    completed(false);
    setDirection("forward");
    dispatch({ type: "parsed", draft: p.draft, source: p.source, removed: p.removed, existing: bio, typed: p.typed });
  };

  const conflicts = useMemo(() => identityConflicts(parsed?.parsedIdentity ?? {}, bio), [parsed, bio]);
  const counts = keptCounts(state);

  /** Until the one-per-screen questions land (R1.11): the answers of the single prefs screen and the onboarded flag, in one PUT. */
  const finishLegacy = async (answers: Record<string, string>) => {
    const merged: Bio = { ...bioRef.current };
    for (const k of ALL_PREFERENCE_KEYS) {
      const v = (answers[k] ?? "").trim();
      if (v) merged[k] = v;
    }
    merged[ONBOARDED_KEY] = new Date().toISOString();
    await putBio(merged);
    bioRef.current = merged;
    const completeness = await fetchCompleteness().catch(() => null);
    notifyExtension("changed");
    // Confirmed: stop drafting (a late save must not bring the draft back), then let the server stamp finishedAt and
    // drop it. Best effort: the profile is saved either way, and an unfinished flag only means the card shows once more.
    sync.finished();
    await finishOnboarding().catch(() => null);
    setResult({ added: addedRef.current, removed: parsed?.removed ?? 0, completeness });
    setDirection("forward");
    dispatch({ type: "goto", step: "done" });
  };
  // ---- the core confirm: "Save my profile" -------------------------------------------------------
  const saveProfile = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const plan = planIdentity(state.identity, parsed?.parsedIdentity ?? {}, bio, bioLimits);
      // What the person answered themselves is theirs ("user"); what was read out of a resume is "parsed".
      const provenance = parsed?.source === "fresh" ? ("USER" as const) : ("PARSED" as const);
      const items = [...keptItems(parsed?.candidates ?? [], state.decisions, state.edits, provenance), ...skillItems(state.skills, provenance), ...languageItems(state.languages, provenance)];
      let added = 0;
      let merged = 0;
      if (!state.imported) {
        if (items.length > config.profile.maxImportItems) {
          setError(`That's ${items.length} entries and one setup can hold ${config.profile.maxImportItems}. Go back and skip a few; you can add the rest from your profile.`);
          return;
        }
        if (items.length > 0 || Object.keys(plan.fromResume).length > 0) {
          const r = await postImport(buildImportBody(items, plan.fromResume));
          added = (r?.created ?? 0) + (r?.merged ?? 0);
          merged = r?.merged ?? 0;
        }
        dispatch({ type: "imported" });
      }
      // The client owns the merge: everything the import wrote must be in the payload, or this PUT would drop it.
      const next: Bio = { ...bio, ...plan.fromResume, ...plan.fromUser };
      await putBio(next);
      bioRef.current = next;
      addedRef.current = added || items.length;
      notifyExtension("changed");
      track("onboarding_core_confirmed", { items: items.length, merged });
      dispatch({ type: "coreConfirmed" });
      completed(false);
      setDirection("forward");
      if (hasPrefQuestions) dispatch({ type: "goto", step: "prefs" });
      else await finishLegacy({});
    } catch (e) {
      setError(finishError(e));
    } finally {
      setSaving(false);
    }
    // `completed` and `finishLegacy` only read refs and the state captured here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, parsed, bio, config.profile.maxImportItems, bioLimits, hasPrefQuestions]);

  const finishPrefs = async () => {
    setSaving(true);
    setError(null);
    try {
      await finishLegacy(state.prefs);
    } catch (e) {
      setError(finishError(e));
    } finally {
      setSaving(false);
    }
  };

  // ---- Back (the top bar) ---------------------------------------------------------------------
  const helloExists = ob.personaStep;
  const back = (): (() => void) | null => {
    const step = state.step;
    if (personaOverlay) return () => (setPersonaOverlay(false), setDirection("back"));
    const to = (s: StepKey, extra?: () => void) => () => {
      setError(null);
      setDirection("back");
      setSoFar(false);
      extra?.();
      dispatch({ type: "goto", step: s });
    };
    switch (step) {
      case "hello":
        return null;
      case "source":
        if (state.path === "paste") return () => (setDirection("back"), dispatch({ type: "backToPath" }));
        if (state.path === "fresh") {
          return () => {
            setDirection("back");
            if ((state.fresh ?? initialFresh(freshGoalFor(state.persona))).step === "goal") dispatch({ type: "backToPath" });
            else dispatch({ type: "fresh", action: { type: "back" } });
          };
        }
        return helloExists ? to("hello") : null;
      case "review":
        return () => {
          setDirection("back");
          if (state.cursor > 0) dispatch({ type: "cursor", cursor: state.cursor - 1 });
          else dispatch({ type: "goto", step: "source" });
        };
      case "skills":
        return to(parsed && parsed.candidates.length > 0 ? "review" : "source");
      case "you":
        return to("skills");
      case "prefs":
        if (soFar) return () => (setDirection("back"), setSoFar(false));
        if (state.coreConfirmedAt) return () => (setDirection("back"), setSoFar(true));
        return to("source");
      default:
        return null;
    }
  };

  // ---- what the bar says -----------------------------------------------------------------------
  const raw = secondsRemaining(steps, state.step, synced.subProgress, ob.stepSeconds);
  if (raw < lowest) setLowest(raw);
  const secs = Math.min(raw, lowest);
  const total = steps.length;
  const progress = total > 0 ? (synced.stepsDone + synced.subProgress) / synced.stepsTotal : 0;
  const label = barLabel(state.step, secs, ob.estimateMinutes);
  const valueText = barValueText(synced.stepsDone + 1, synced.stepsTotal, secs);

  const resumed = sync.resumed;
  const banners: ReactNode[] = [];
  if (sync.conflict) banners.push(<ConflictBanner key="conflict" onUseThat={() => void takeTheirs()} onKeepMine={() => void keepMine()} busy={syncBusy} />);
  if (resumed && resumed.step === state.step && isResumable(state) && state.step !== "done") {
    banners.push(<ResumeBanner key="resumed" resumed={resumed} onStartOver={() => void startOver()} busy={syncBusy} />);
  }

  // ---- the screen ------------------------------------------------------------------------------
  let screen: ReactNode = null;
  let screenKey: string = state.step;
  const mascot = ob.mascot;
  if (personaScreen) {
    screenKey = "hello";
    screen = (
      <PersonaStep
        firstName={firstName || (typeof bio.firstName === "string" ? bio.firstName : "")}
        value={personaPick ?? state.persona}
        onChange={setPersonaPick}
        onContinue={() => choosePersona(personaPick ?? state.persona)}
        onLater={() => choosePersona(null)}
        mascot={mascot}
      />
    );
  } else if (state.step === "source") {
    if (state.path === "paste") {
      screenKey = "paste";
      screen = <PasteStep onParsed={onParsed} onBack={() => dispatch({ type: "backToPath" })} bioLimits={bioLimits} />;
    } else if (fresh) {
      screenKey = "fresh";
      screen = (
        <FreshFlow
          fresh={state.fresh ?? initialFresh(freshGoalFor(state.persona))}
          dispatch={(action) => dispatch({ type: "fresh", action })}
          bioLimits={bioLimits}
          bulletChars={config.limits.bulletChars}
          onDone={onParsed}
        />
      );
    } else {
      screenKey = "source";
      screen = <SourceStep persona={state.persona} maxBytes={config.profile.uploadMaxBytes} bioLimits={bioLimits} onParsed={onParsed} onPath={choosePath} onSkip={skipSource} mascot={mascot} />;
    }
  } else if (state.step === "review" && parsed) {
    screenKey = state.cursor >= parsed.candidates.length ? "review-recap" : "review";
    screen = (
      <ReviewScreen
        candidates={parsed.candidates}
        decisions={state.decisions}
        edits={state.edits}
        cursor={state.cursor}
        limits={limits}
        removed={parsed.removed}
        skillCount={state.skills.length}
        mascot={mascot}
        onDecide={(id, decision) => dispatch({ type: "decide", id, decision })}
        onUndecide={(id) => dispatch({ type: "undecide", id })}
        onEdit={(id, data) => dispatch({ type: "edit", id, data })}
        onKeepRemaining={() => dispatch({ type: "decideAll", decision: "keep" })}
        onDone={(kept, skipped) => advance(false, { kept, skipped })}
        provenance={parsed.source === "fresh" ? "USER" : "PARSED"}
      />
    );
  } else if (state.step === "skills" && parsed) {
    screen = (
      <SkillsStep
        skills={state.skills}
        suggestions={[...parsed.skills, ...parsed.suggestions]}
        languages={state.languages}
        onSkills={(s) => dispatch({ type: "skills", skills: s })}
        onLanguages={(l) => dispatch({ type: "languages", languages: l })}
        onContinue={() => advance(false)}
        onSkip={() => {
          dispatch({ type: "skills", skills: [] });
          advance(true);
        }}
        suggestionsTitle={parsed.source === "fresh" ? "Suggested for you" : undefined}
        fresh={parsed.source === "fresh"}
      />
    );
  } else if (state.step === "you" && parsed) {
    screen = (
      <IdentityStep
        values={state.identity}
        conflicts={conflicts}
        onChange={(key: IdentityKey, value: string) => dispatch({ type: "identity", key, value })}
        onSave={() => void saveProfile()}
        saving={saving}
        retry={state.imported}
        error={error}
      />
    );
  } else if (state.step === "prefs") {
    if (soFar) {
      screenKey = "so-far";
      screen = (
        <ProfileSoFar
          line={parsed ? summaryLine(counts, state.skills.length).replace(/^Adding /, "").replace(/\.$/, "") : null}
          hasContact={!!(state.identity.firstName || state.identity.email || bio.firstName)}
          onBack={() => (setDirection("forward"), setSoFar(false))}
        />
      );
    } else {
      screen = (
        <div>
          <PreferencesStep questions={questions} answers={state.prefs} onChange={(key, value) => dispatch({ type: "pref", key, value })} />
          {error && (
            <p role="alert" className="mt-3 text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <StepFooter>
            <Button variant="accent" size="lg" onClick={() => void finishPrefs()} disabled={saving} className="w-full max-sm:min-h-11">
              {saving ? "Saving…" : "Continue"}
            </Button>
            <SkipButton onClick={() => void finishPrefs()} disabled={saving}>
              Skip for now
            </SkipButton>
          </StepFooter>
        </div>
      );
    }
  } else if (state.step === "done" && result) {
    return <FinishStep result={result} />;
  }

  if (!sync.ready) return <div className="mx-auto min-h-[60vh] w-full max-w-[560px]" aria-busy />;

  return (
    <OnboardingShell
      screenKey={screenKey}
      direction={direction}
      progress={progress}
      label={label}
      valueText={valueText}
      announce={`Step ${Math.min(synced.stepsDone + 1, synced.stepsTotal)} of ${synced.stepsTotal}`}
      onBack={back()}
      sync={{ status: sync.status, reason: sync.reason, onRetry: sync.retry }}
      onChangePersona={ob.personaStep ? () => (setPersonaPick(null), setDirection("forward"), setPersonaOverlay(true)) : undefined}
      onStartOver={() => void startOver()}
      onExit={() => track("onboarding_dismissed", { action: "exit" })}
      banners={banners.length > 0 ? banners : undefined}
    >
      {screen}
    </OnboardingShell>
  );
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
