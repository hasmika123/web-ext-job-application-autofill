"use client";

/**
 * `useDraftSync` (Onboarding v2 R1.9, ONBOARDING-V2-DESIGN 7.2 - 7.4, DECISIONS #32 / #33g): never lose a tap.
 *
 *   every change  ->  local mirror (localStorage, synchronous)  ->  trailing 600 ms debounce  ->  PUT /draft
 *   page hidden / closing  ->  navigator.sendBeacon to the BFF's POST alias of the same PUT
 *   a failed save  ->  "offline" / "couldn't save" + retry with a growing wait (and at once on `online` / "Retry")
 *   a 409          ->  the conflict state, with "Use that" (take the server's) and "Keep mine" (force)
 *   on load        ->  reconcile the server draft, the local mirror and an old v1 `sessionStorage` draft
 *
 * At most one PUT is in flight and the latest state wins. The server draft is never written before there is
 * something worth resuming (`isResumable`), and it never holds the application-question answers (`draftPayload`).
 * Nothing here writes the profile: the extension's mirror only moves at the confirm points.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ONBOARDING_EVENTS as EV, trackOnboarding } from "@/lib/onboarding/events";
import { draftPayload, isResumable, migrateV1Draft, readState, type SetupState } from "@/lib/profile-setup/state";
import { OnboardingApiError, deleteDraft, getOnboarding, putDraft, sendDraftBeacon, sendDraftKeepalive, type DraftBody, type OnboardingStatus } from "./api";
import { clearMirror, readMirror, writeMirror, type Mirror } from "./mirror";

/** DESIGN 7.2: the trailing debounce before a draft PUT (a hard constant, not a setting). */
export const SAVE_DEBOUNCE_MS = 600;
/** DESIGN 7.3: a local copy only beats the server's when it is newer by more than this (clock skew favours the server). */
export const CLOCK_SKEW_MS = 60_000;
/** DESIGN 7.2: offline retry waits, 2 s growing to 30 s, then doubling up to a 5 minute cap. */
export const RETRY_STEPS_MS = [2_000, 5_000, 15_000, 30_000];
export const RETRY_CAP_MS = 300_000;

/** The wait before retry number `n` (0 = the first retry). */
export function retryDelay(n: number): number {
  if (n < RETRY_STEPS_MS.length) return RETRY_STEPS_MS[n];
  return Math.min(RETRY_CAP_MS, RETRY_STEPS_MS[RETRY_STEPS_MS.length - 1] * 2 ** (n - RETRY_STEPS_MS.length + 1));
}

/** `idle`: nothing saved yet this visit. `conflict`: another device saved since; the person chooses. */
export type SyncStatus = "idle" | "saving" | "saved" | "offline" | "conflict";
/**
 * Why a save did not reach the server: `network` = the browser is offline or the request itself failed (the only case the pill
 * says "Offline" for), `server` = the request got an answer that was not a success (the API or the BFF is down or erroring: "Couldn't
 * save"), `demo` = a read-only demo login, `refused` = the draft itself was refused (too large, a value we never store).
 */
export type OfflineReason = "network" | "server" | "demo" | "refused";

/** The reason for a failure: a request that threw (status 0) or a browser that says it is offline is the network; any other answer is the server. */
function reasonOf(e: unknown): OfflineReason {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  return e instanceof OnboardingApiError && e.status !== 0 ? "server" : "network";
}

export interface SyncError {
  code: string;
  message: string;
  /** `SENSITIVE_CONTENT`: the class of value (a SensitivePatterns class). */
  cls?: string;
  max?: number;
}

export interface Resumed {
  device: "same" | "other";
  stepsDone: number;
  stepsTotal: number;
  /** The step the person was brought back to (the banner shows on that screen only). */
  step: string;
}

export interface DraftPick {
  source: "none" | "server" | "local" | "v1";
  state?: SetupState;
  /** The server draft's `updatedAt` the state is in step with (the next PUT's `baseUpdatedAt`). */
  base: string | null;
  /** There is something to push. */
  dirty: boolean;
  device: "same" | "other";
}

const stamp = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/**
 * DESIGN 7.3: which copy of the draft to start from. The server's draft wins unless the local mirror is in step with it
 * (then local, which may hold unsent changes) or newer by more than the clock-skew tolerance (the person worked offline).
 * A v1 `sessionStorage` draft is only used when nothing else exists.
 */
export function pickDraft(input: { server: OnboardingStatus | null; local: Mirror | null; v1: SetupState | null }): DraftPick {
  const { server } = input;
  const row = server?.draft ?? null;
  const theirs = row?.state ? readState(row.state) : null;
  let local = input.local;
  // Finished on another device (the server has no draft and says FINISHED): this copy is stale.
  if (local && !row && server?.status === "FINISHED" && local.base !== null) local = null;
  if (local && !isResumable(local.state)) local = null;

  if (row && theirs) {
    if (local) {
      // The very same write (our beacon, or a save whose answer we never saw): in step, nothing to push.
      if (local.state.updatedAt !== null && local.state.updatedAt === theirs.updatedAt) return { source: "server", state: theirs, base: row.updatedAt, dirty: false, device: "same" };
      if (local.base === row.updatedAt) return { source: "local", state: local.state, base: local.base, dirty: local.dirty, device: "same" };
      if (stamp(local.state.updatedAt) - stamp(row.updatedAt) > CLOCK_SKEW_MS) return { source: "local", state: local.state, base: row.updatedAt, dirty: true, device: "same" };
    }
    return { source: "server", state: theirs, base: row.updatedAt, dirty: false, device: "other" };
  }
  if (local) return { source: "local", state: local.state, base: local.base, dirty: local.dirty || local.base === null, device: "same" };
  if (input.v1) return { source: "v1", state: input.v1, base: null, dirty: true, device: "same" };
  return { source: "none", base: null, dirty: false, device: "same" };
}

function bodyOf(state: SetupState, base: string | null, force = false): DraftBody {
  return {
    v: 2,
    step: state.step,
    persona: state.persona,
    stepsDone: state.stepsDone,
    stepsTotal: state.stepsTotal,
    state: draftPayload(state),
    ...(base ? { baseUpdatedAt: base } : {}),
    ...(force ? { force: true } : {}),
  };
}

export interface UseDraftSyncOptions {
  /** The wizard state with its progress numbers already applied (`withProgress`). */
  state: SetupState;
  /** Whose draft: the local mirror is only offered back to the same login. */
  login: string;
  /** `GET /api/profile/onboarding?include=state` as the page loaded it; null when the API could not be reached. */
  server: OnboardingStatus | null;
  /** Take a whole state (from the server or the mirror) into the wizard. */
  onHydrate: (state: SetupState) => void;
}

export interface DraftSync {
  /** The reconcile on load is done (until then the wizard shows nothing, so a resumed step never flashes the picker). */
  ready: boolean;
  status: SyncStatus;
  reason: OfflineReason;
  conflict: boolean;
  /** A refusal worth telling the person about (too large, a value we never store). Cleared by `clearError`. */
  error: SyncError | null;
  /** Set when the wizard was brought back to a saved draft on load. */
  resumed: Resumed | null;
  clearError: () => void;
  /** "Retry" in the offline pill: try the save now. */
  retry: () => void;
  /** Conflict: take the other device's draft ("Use that"). */
  acceptServer: () => Promise<void>;
  /** Conflict: overwrite it with this one ("Keep mine", `force`). */
  keepMine: () => Promise<void>;
  /** Start over: delete the server draft and the local mirror. The caller resets the wizard. */
  startOver: () => Promise<void>;
  /** The wizard finished: stop syncing and drop the mirror. */
  finished: () => void;
}

export default function useDraftSync({ state, login, server, onHydrate }: UseDraftSyncOptions): DraftSync {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [reason, setReason] = useState<OfflineReason>("network");
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<SyncError | null>(null);
  const [resumed, setResumed] = useState<Resumed | null>(null);

  const stateRef = useRef(state);
  const loginRef = useRef(login);
  const onHydrateRef = useRef(onHydrate);
  const readyRef = useRef(false);
  const finishedRef = useRef(false);
  const mountedRef = useRef(true);
  const conflictRef = useRef(false);
  /** The server draft's `updatedAt` our copy is in step with: `baseUpdatedAt` of the next PUT. */
  const baseRef = useRef<string | null>(null);
  /** The `updatedAt` stamp of the state the server last confirmed; a state with another stamp is unsent. */
  const persisted = useRef<string | null>(null);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const offlineTracked = useRef(false);
  /** Stamps of the states we sent (a beacon's answer is never seen): a 409 whose draft carries one of them is our own write. */
  const sent = useRef<string[]>([]);
  const saveRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    stateRef.current = state;
    loginRef.current = login;
    onHydrateRef.current = onHydrate;
  });

  const storage = () => (typeof window === "undefined" ? undefined : window.localStorage);

  const remember = (s: SetupState) => {
    const list = sent.current;
    if (s.updatedAt && !list.includes(s.updatedAt)) sent.current = [...list.slice(-19), s.updatedAt];
  };

  const clearTimers = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    timer.current = null;
    retryTimer.current = null;
  };

  const setConflicted = (on: boolean) => {
    conflictRef.current = on;
    setConflict(on);
  };

  // ---- reconcile on load -----------------------------------------------------------------------
  useEffect(() => {
    const local = readMirror(storage(), loginRef.current);
    let v1: SetupState | null = null;
    try {
      v1 = migrateV1Draft(window.sessionStorage);
    } catch {
      // storage blocked
    }
    const pick = pickDraft({ server, local, v1 });
    if (pick.source !== "none" && pick.state) {
      const s = pick.state;
      baseRef.current = pick.base;
      // A state still to push keeps a stamp the server has not confirmed, so the save effect below picks it up.
      persisted.current = pick.dirty ? null : s.updatedAt;
      onHydrateRef.current(s);
      writeMirror(storage(), { login: loginRef.current, base: pick.base, dirty: pick.dirty, state: s });
      const ageHours = s.updatedAt ? Math.max(0, Math.round((Date.now() - stamp(s.updatedAt)) / 3_600_000)) : 0;
      trackOnboarding(EV.resumed, { stepsDone: s.stepsDone, stepsTotal: s.stepsTotal, device: pick.device, ageHours });
      setResumed({ device: pick.device, stepsDone: s.stepsDone, stepsTotal: s.stepsTotal, step: s.step });
      if (server !== null && !pick.dirty) setStatus("saved");
    }
    if (server === null && pick.source !== "none") {
      // The API could not be reached on load (the page itself did load, so unless the browser says otherwise it is the server): the flow opens from this device and keeps trying.
      setReason(typeof navigator !== "undefined" && navigator.onLine === false ? "network" : "server");
      setStatus("offline");
      retryTimer.current = setTimeout(() => void saveRef.current(), retryDelay(retries.current++));
    }
    readyRef.current = true;
    setReady(true);
    // The reconcile is a once-per-mount effect over the props the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- save ------------------------------------------------------------------------------------
  const scheduleRetry = () => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => void saveRef.current(), retryDelay(retries.current++));
  };

  const pending = () => stateRef.current.updatedAt !== persisted.current && isResumable(stateRef.current);

  const fail = (e: unknown, force: boolean): void => {
    const err = e instanceof OnboardingApiError ? e : new OnboardingApiError(0, { code: "NETWORK" }, "Couldn't reach the server.");
    if (err.code === "DRAFT_CONFLICT" && !force) {
      void settleConflict(err);
      return;
    }
    if (err.code === "DEMO_READ_ONLY") {
      setReason("demo");
      setStatus("offline");
      return;
    }
    if (err.retryable || err.status === 401) {
      setReason(reasonOf(err));
      setStatus("offline");
      if (!offlineTracked.current) {
        offlineTracked.current = true;
        trackOnboarding(EV.draftOffline, { retries: retries.current });
      }
      scheduleRetry();
      return;
    }
    // A refusal of the draft itself: it stays on this device, and the next change tries again.
    setReason("refused");
    setStatus("offline");
    setError({ code: err.code ?? String(err.status), message: err.message, cls: err.cls ?? undefined, max: err.max ?? undefined });
  };

  /** A 409 is another device's write unless the stored draft carries a stamp of ours (a beacon, or an answer we lost). */
  const settleConflict = async (err: OnboardingApiError): Promise<void> => {
    try {
      const st = await getOnboarding(true);
      if (!mountedRef.current) return;
      const row = st.draft;
      const theirs = row?.state ? readState(row.state) : null;
      if (!row) {
        baseRef.current = null;
        void saveRef.current();
        return;
      }
      if (theirs?.updatedAt && sent.current.includes(theirs.updatedAt)) {
        baseRef.current = row.updatedAt;
        void saveRef.current();
        return;
      }
      baseRef.current = row.updatedAt;
    } catch (e) {
      // can't tell: treat it like any failed save and look again later
      if (!mountedRef.current) return;
      setReason(reasonOf(e));
      setStatus("offline");
      scheduleRetry();
      return;
    }
    void err;
    setConflicted(true);
    setStatus("conflict");
  };

  const save = useCallback(async (force = false): Promise<void> => {
    if (finishedRef.current || !readyRef.current) return;
    if (conflictRef.current && !force) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    const s = stateRef.current;
    if (!isResumable(s) || (!force && s.updatedAt === persisted.current)) return;
    inFlight.current = true;
    let ok = false;
    setStatus("saving");
    remember(s);
    try {
      const res = await putDraft(bodyOf(s, baseRef.current, force));
      if (!mountedRef.current || finishedRef.current) return;
      baseRef.current = res.updatedAt;
      persisted.current = s.updatedAt;
      retries.current = 0;
      offlineTracked.current = false;
      setError(null);
      const latest = stateRef.current;
      writeMirror(storage(), { login: loginRef.current, base: res.updatedAt, dirty: latest.updatedAt !== s.updatedAt, state: latest });
      setStatus("saved");
      ok = true;
      if (latest.updatedAt !== s.updatedAt) queued.current = true;
    } catch (e) {
      if (mountedRef.current && !finishedRef.current) fail(e, force);
    } finally {
      inFlight.current = false;
      const again = queued.current;
      queued.current = false;
      // A failed save has its own backoff; only a good one is followed at once by what changed meanwhile.
      if (again && ok && mountedRef.current && !finishedRef.current && !conflictRef.current && pending()) void saveRef.current();
    }
    // `fail` and `settleConflict` only touch refs and setters; they are stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Every change: the mirror at once, the PUT after the debounce.
  useEffect(() => {
    if (!ready || finishedRef.current) return;
    if (state.updatedAt === persisted.current || !isResumable(state)) return;
    writeMirror(storage(), { login, base: baseRef.current, dirty: true, state });
    if (conflictRef.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, [state, ready, login]);

  // The page is hidden or closing: flush what is unsent with a beacon, which the browser finishes even if the page dies.
  useEffect(() => {
    const flush = () => {
      if (!readyRef.current || finishedRef.current || conflictRef.current || !pending()) return;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      const s = stateRef.current;
      remember(s);
      const body = bodyOf(s, baseRef.current);
      if (!sendDraftBeacon(body)) sendDraftKeepalive(body);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onOnline = () => {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      if (pending()) void saveRef.current();
      else setStatus((prev) => (prev === "offline" ? "saved" : prev));
    };
    const onOffline = () => {
      setReason("network");
      setStatus((prev) => (prev === "idle" ? prev : "offline"));
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // pending() reads refs only
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, []);

  // ---- what the shell calls ----------------------------------------------------------------------
  const retry = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    void saveRef.current();
  }, []);

  const acceptServer = useCallback(async () => {
    try {
      const st = await getOnboarding(true);
      const row = st.draft;
      const theirs = row?.state ? readState(row.state) : null;
      trackOnboarding(EV.draftConflict, { choice: "theirs" });
      setConflicted(false);
      if (row && theirs) {
        baseRef.current = row.updatedAt;
        persisted.current = theirs.updatedAt;
        onHydrateRef.current(theirs);
        writeMirror(storage(), { login: loginRef.current, base: row.updatedAt, dirty: false, state: theirs });
        setStatus("saved");
      } else {
        // The other device's draft is gone (it finished, or started over): this copy is the only one left, keep saving it.
        baseRef.current = null;
        persisted.current = null;
        void saveRef.current(true);
      }
    } catch (e) {
      setReason(reasonOf(e));
      setStatus("offline");
    }
  }, []);

  const keepMine = useCallback(async () => {
    trackOnboarding(EV.draftConflict, { choice: "mine" });
    setConflicted(false);
    await saveRef.current(true);
  }, []);

  const startOver = useCallback(async () => {
    clearTimers();
    queued.current = false;
    clearMirror(storage());
    baseRef.current = null;
    persisted.current = null;
    sent.current = [];
    setConflicted(false);
    setError(null);
    setResumed(null);
    setStatus("idle");
    try {
      await deleteDraft();
    } catch {
      // offline: the draft expires on its own, and the next real change replaces it
    }
  }, []);

  const finished = useCallback(() => {
    finishedRef.current = true;
    clearTimers();
    clearMirror(storage());
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { ready, status, reason, conflict, error, resumed, clearError, retry, acceptServer, keepMine, startOver, finished };
}
