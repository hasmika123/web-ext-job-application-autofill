"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Button, useToast } from "@kiwiply/ui";
import type { Bio } from "@/components/BioEditor";
import { unansweredQuestions } from "@/components/onboarding/preferences";
import { track } from "@/lib/analytics";
import { notifyExtension } from "@/lib/extension-signal";
import { ItemApiError } from "@/lib/profile-items";
import { finishOnboarding, patchOnboarding, type OnboardingStatus } from "@/lib/onboarding/api";
import { autofillCoverage } from "@/lib/onboarding/coverage";
import { freshGoalFor, prefOrder } from "@/lib/onboarding/persona";
import { barLabel, barValueText, secondsRemaining } from "@/lib/onboarding/progress";
import useDraftSync, { type SyncError } from "@/lib/onboarding/useDraftSync";
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
import FreshFlow from "./FreshFlow";
import IdentityStep from "./IdentityStep";
import OnboardingShell from "./OnboardingShell";
import PasteStep from "./PasteStep";
import PersonaStep from "./PersonaStep";
import PayoffStep, { type PayoffAction } from "./PayoffStep";
import PrefsFlow, { prefId, valuesToWrite } from "./PrefsFlow";
import ProfileSoFar from "./ProfileSoFar";
import ResumeBanner from "./ResumeBanner";
import ReviewScreen from "./ReviewScreen";
import SkillsStep from "./SkillsStep";
import SourceStep from "./SourceStep";

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
  returnTo = null,
  jobsCount = null,
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
  /** A same-origin path the payoff's Build a resume goes to (the new-resume chooser's `?return=`). */
  returnTo?: string | null;
  /** How many real daily job matches there are (the payoff's Find jobs line); null when there are none. */
  jobsCount?: number | null;
}) {
  const toast = useToast();
  const ob = config.onboarding ?? DEFAULT_BUILDER_CONFIG.onboarding;
  const questions = useMemo(() => unansweredQuestions(bio), [bio]);

  // A deep link (`?path=` / `?step=prefs`) only sets where a NEW run starts: a saved draft is never replaced by it. The `hello`
  // screen comes first until there is a persona (or the admin turned it off).
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE, (s): SetupState => {
    const persona = server?.persona ?? null;
    const base: SetupState = { ...s, persona };
    const first: StepKey = ob.personaStep && persona === null ? "hello" : "source";
    // `?step=prefs` (the retired /welcome): the questions straight away; with none left, the payoff follows at once.
    if (initialStep === "prefs") return { ...base, step: "prefs" };
    if (initialPath) return { ...base, path: initialPath, step: first };
    return { ...base, step: first };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fields: number; score: number | null } | null>(null);
  const [prefIndex, setPrefIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  /** The answers are saved and only the wrap-up (`POST /finish`) failed: Continue / Skip try just that again. */
  const [wrapFailed, setWrapFailed] = useState(false);
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
  const runStart = useRef(0);
  const answered = useRef(0);
  const wrapStarted = useRef(false);

  const parsed = state.parsed;
  const fresh = state.path === "fresh";
  // The questions in the persona's order, minus the ones the profile already answers (DESIGN 3.2). EEO is always last; "Show all"
  // brings back what the persona hid, just before it.
  const order = prefOrder(state.persona);
  const byId = new Map(questions.map((q) => [prefId(q), q]));
  const shown = order.shown.filter((id) => byId.has(id));
  const hidden = order.hidden.filter((id) => byId.has(id));
  const nonEeo = shown.filter((id) => id !== "gender");
  const prefList = (showAll ? [...nonEeo, ...hidden, ...shown.filter((id) => id === "gender")] : shown).map((id) => byId.get(id)!);
  const hasPrefQuestions = prefList.length > 0;
  const firstUndone = prefList.findIndex((q) => !state.prefsDone.includes(prefId(q)));
  const index = Math.min(prefIndex ?? (firstUndone === -1 ? Math.max(0, prefList.length - 1) : firstUndone), Math.max(0, prefList.length - 1));
  // Arriving on the questions with nothing parsed (the `/welcome` link): just the questions, then done.
  const prefsOnly = state.step === "prefs" && !parsed;
  const steps: StepKey[] = prefsOnly ? ["prefs", "done"] : stepsFor(state, hasPrefQuestions);
  const limits: DraftLimits = { bullets: config.limits.bullets, bulletChars: config.limits.bulletChars };
  const bioLimits: BioLimits = useMemo(
    () => ({ valueChars: config.profile.bioValueMaxChars, summaryChars: config.profile.bioSummaryMaxChars }),
    [config.profile.bioValueMaxChars, config.profile.bioSummaryMaxChars],
  );

  // The state as it is saved: with "n of total done" and how far through the step (DESIGN 3.1).
  const synced = useMemo(() => withProgress(state, hasPrefQuestions, prefList.length), [state, hasPrefQuestions, prefList.length]);
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

  useEffect(() => {
    runStart.current = Date.now();
  }, []);

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
    setPrefIndex(null);
    setShowAll(false);
    setWrapFailed(false);
    wrapStarted.current = false;
    answered.current = 0;
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

  // ---- the wrap-up: finish, then the payoff ---------------------------------------------------------
  /**
   * `POST /api/profile/onboarding/finish` (no Finish button: the last question, or the core confirm when no question is left,
   * ends here). Stops drafting first, so a late save cannot bring the draft back; the server stamps `finishedAt` + `onboardedAt`,
   * drops the draft and answers with the honest "~N fields". If it fails the answers are already saved: the person just retries.
   */
  const wrapUp = async () => {
    setSaving(true);
    setError(null);
    setWrapFailed(false);
    sync.finished();
    try {
      const res = await finishOnboarding();
      const fields = res.coverage?.fields ?? autofillCoverage(bioRef.current, { experience: counts.EXPERIENCE, education: counts.EDUCATION, skills: state.skills.length }).fields;
      const score = res.completeness?.score ?? null;
      track("onboarding_finished", {
        fields,
        score,
        seconds: Math.round((Date.now() - runStart.current) / 1000),
        persona: state.persona ?? "none",
        path: state.path ?? "skip",
        prefsAnswered: answered.current,
      });
      setResult({ fields, score });
      setDirection("forward");
      dispatch({ type: "goto", step: "done" });
    } catch {
      setError("Couldn't wrap up. Try again.");
      setWrapFailed(true);
    } finally {
      setSaving(false);
    }
  };

  // `?step=prefs` with nothing left to ask (or a draft whose questions were answered elsewhere): straight to the payoff.
  useEffect(() => {
    if (!sync.ready || state.step !== "prefs" || prefList.length > 0 || soFar || wrapStarted.current) return;
    wrapStarted.current = true;
    void wrapUp();
    // wrapUp reads what is current when it runs; the run is once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.ready, state.step, prefList.length, soFar]);

  // ---- the core confirm: "Save my profile" -------------------------------------------------------
  const saveProfile = useCallback(async () => {
    // The import and the PUT already went through and only the wrap-up failed: just that again.
    if (state.coreConfirmedAt) {
      await wrapUp();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const plan = planIdentity(state.identity, parsed?.parsedIdentity ?? {}, bio, bioLimits);
      // What the person answered themselves is theirs ("user"); what was read out of a resume is "parsed".
      const provenance = parsed?.source === "fresh" ? ("USER" as const) : ("PARSED" as const);
      const items = [...keptItems(parsed?.candidates ?? [], state.decisions, state.edits, provenance), ...skillItems(state.skills, provenance), ...languageItems(state.languages, provenance)];
      let merged = 0;
      if (!state.imported) {
        if (items.length > config.profile.maxImportItems) {
          setError(`That's ${items.length} entries and one setup can hold ${config.profile.maxImportItems}. Go back and skip a few; you can add the rest from your profile.`);
          return;
        }
        if (items.length > 0 || Object.keys(plan.fromResume).length > 0) {
          const r = await postImport(buildImportBody(items, plan.fromResume));
          merged = r?.merged ?? 0;
        }
        dispatch({ type: "imported" });
      }
      // The client owns the merge: everything the import wrote must be in the payload, or this PUT would drop it.
      const next: Bio = { ...bio, ...plan.fromResume, ...plan.fromUser };
      await putBio(next);
      bioRef.current = next;
      notifyExtension("changed");
      track("onboarding_core_confirmed", { items: items.length, merged });
      dispatch({ type: "coreConfirmed" });
      completed(false);
      setDirection("forward");
      if (hasPrefQuestions) dispatch({ type: "goto", step: "prefs" });
      else await wrapUp();
    } catch (e) {
      setError(finishError(e));
    } finally {
      setSaving(false);
    }
    // `completed` and `finishLegacy` only read refs and the state captured here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, parsed, bio, config.profile.maxImportItems, bioLimits, hasPrefQuestions]);

  // ---- the application questions: one per screen, each answer its own write ---------------------------
  const moveOn = async () => {
    if (index < prefList.length - 1) {
      setError(null);
      setDirection("forward");
      setPrefIndex(index + 1);
      return;
    }
    completed(false);
    await wrapUp();
  };
  /** Continue: a merge PUT of just this question's keys (the `/welcome` behaviour), then the next screen. */
  const answerPref = async () => {
    if (wrapFailed) {
      await wrapUp();
      return;
    }
    const q = prefList[index];
    const values = valuesToWrite(q, state.prefs, state.persona);
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(values).length > 0) {
        const next: Bio = { ...bioRef.current, ...values };
        await putBio(next);
        bioRef.current = next;
        answered.current += 1;
        notifyExtension("changed");
      }
      dispatch({ type: "prefDone", key: prefId(q) });
      track("onboarding_pref_answered", { key: prefId(q), skipped: false });
    } catch {
      setError("Couldn't save that answer. Try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
    await moveOn();
  };
  /** Skip this one: nothing is written, the question is only marked done. */
  const skipPref = async () => {
    if (wrapFailed) {
      await wrapUp();
      return;
    }
    const q = prefList[index];
    dispatch({ type: "prefDone", key: prefId(q) });
    track("onboarding_pref_answered", { key: prefId(q), skipped: true });
    await moveOn();
  };
  const showAllQuestions = () => {
    setDirection("forward");
    setShowAll(true);
    setPrefIndex(nonEeo.length); // the first question the persona hid
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
        if (index > 0) return () => (setError(null), setDirection("back"), setPrefIndex(index - 1));
        if (state.coreConfirmedAt) return () => (setError(null), setDirection("back"), setSoFar(true));
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
    } else if (prefList.length === 0) {
      screenKey = "wrapping";
      screen = (
        <div role="status" className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-[15px] font-semibold text-v2-ink-soft">{error ?? "Wrapping up…"}</p>
          {wrapFailed && (
            <Button variant="accent" onClick={() => void wrapUp()} disabled={saving} className="max-sm:min-h-11">
              Try again
            </Button>
          )}
        </div>
      );
    } else {
      const q = prefList[index];
      screenKey = `pref-${prefId(q)}`;
      screen = (
        <PrefsFlow
          key={prefId(q)}
          question={q}
          persona={state.persona}
          answers={state.prefs}
          first={index === 0}
          last={index === prefList.length - 1}
          hiddenLeft={showAll ? 0 : hidden.length}
          saving={saving}
          error={error}
          retryWrapUp={wrapFailed}
          onChange={(key, value) => dispatch({ type: "pref", key, value })}
          onContinue={() => void answerPref()}
          onSkip={() => void skipPref()}
          onShowAll={showAllQuestions}
        />
      );
    }
  } else if (state.step === "done" && result) {
    return (
      <PayoffStep
        firstName={state.identity.firstName || (typeof bio.firstName === "string" ? bio.firstName : "") || firstName}
        fields={result.fields}
        score={result.score}
        actions={ob.payoffActions}
        returnTo={returnTo}
        jobsCount={jobsCount}
        mascot={ob.mascot}
        confetti={ob.confetti}
        onAction={(action: PayoffAction | "dashboard") => track("onboarding_payoff_action", { action })}
      />
    );
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
