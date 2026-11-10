"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDelight } from "@/lib/onboarding/delight";
import { LINE_HOLD_MS, POSE_HOLD_MS, POSE_MOTION, REACT_MS, restingMotion, type MascotPose } from "./poses";

/**
 * The companion's brain (R1.14, ONBOARDING-DELIGHT-DESIGN 2.4 / 2.5): one mascot per screen that rests in the screen's base pose
 * and reacts to what the person does. It is a tiny state machine in a context so the dock (the shell), the phone head (the
 * heading row) and the screens read and drive the same companion:
 *
 *  - a screen declares its base pose and idle line with {@link useCompanionScene} (cleared when the screen goes away);
 *  - an action calls `react(pose, line?)` ({@link useCompanionReact}): the pose shows (with its motion) for the keyframe's
 *    duration, at least {@link POSE_HOLD_MS}, then returns to the base pose; the reaction's line holds {@link LINE_HOLD_MS}
 *    in the bubble, then the screen's own line comes back. A reaction that arrives while one plays REPLACES it (no queue:
 *    the person taps fast, the mascot keeps up).
 *
 * Nothing here is announced (the dock is `aria-hidden`, DESIGN 2.6) and nothing is written to the draft or the server.
 */

export interface CompanionScene {
  pose: MascotPose;
  /** The idle line in the bubble. */
  line: string | null;
  /** The one-line caption variant on a phone; falls back to `line`. */
  phoneLine: string | null;
}

interface Reaction {
  pose: MascotPose;
  /** Bumped per reaction, so the same pose twice in a row replays its motion. */
  n: number;
}
interface ReactionLine {
  line: string;
  phoneLine: string;
}

/** The stable half: what screens call. It never changes between renders, so a reaction does not re-render the screens. */
interface CompanionActions {
  setScene: (scene: CompanionScene | null) => void;
  react: (pose: MascotPose, line?: string, phoneLine?: string) => void;
}
/** The live half: what the dock, the head and the caption draw. */
interface CompanionState {
  scene: CompanionScene | null;
  reaction: Reaction | null;
  reactionLine: ReactionLine | null;
}

const ActionsCtx = createContext<CompanionActions | null>(null);
const StateCtx = createContext<CompanionState | null>(null);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const { mascot } = useDelight();
  const [scene, setScene] = useState<CompanionScene | null>(null);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [reactionLine, setReactionLine] = useState<ReactionLine | null>(null);
  const counter = useRef(0);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (poseTimer.current) clearTimeout(poseTimer.current);
      if (lineTimer.current) clearTimeout(lineTimer.current);
    },
    [],
  );

  const react = useCallback((pose: MascotPose, line?: string, phoneLine?: string) => {
    if (poseTimer.current) clearTimeout(poseTimer.current);
    if (lineTimer.current) clearTimeout(lineTimer.current);
    counter.current += 1;
    setReaction({ pose, n: counter.current });
    poseTimer.current = setTimeout(() => setReaction(null), Math.max(REACT_MS[pose], POSE_HOLD_MS));
    if (line) {
      setReactionLine({ line, phoneLine: phoneLine ?? line });
      lineTimer.current = setTimeout(() => setReactionLine(null), LINE_HOLD_MS);
    } else {
      setReactionLine(null);
    }
  }, []);

  const actions = useMemo<CompanionActions | null>(() => (mascot ? { setScene, react } : null), [mascot, react]);
  const state = useMemo<CompanionState | null>(() => (mascot ? { scene, reaction, reactionLine } : null), [mascot, scene, reaction, reactionLine]);
  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

/** Is there a companion on this screen (delight on, mascot on, inside the setup flow)? Everything else renders nothing. */
export function useCompanionActive(): boolean {
  return useContext(ActionsCtx) !== null;
}

/**
 * Declare the screen's base pose and idle line (re-declared whenever they change; removed on unmount). A screen with
 * no companion (delight off) does nothing.
 */
export function useCompanionScene(pose: MascotPose, line: string | null, phoneLine?: string | null) {
  const set = useContext(ActionsCtx)?.setScene;
  useEffect(() => {
    if (!set) return;
    set({ pose, line, phoneLine: phoneLine ?? line });
    return () => set(null);
  }, [set, pose, line, phoneLine]);
}

const NOOP = () => undefined;

/** `react(pose, line?, phoneLine?)`: a one-shot reaction; a no-op without a companion. Stable between renders. */
export function useCompanionReact(): (pose: MascotPose, line?: string, phoneLine?: string) => void {
  return useContext(ActionsCtx)?.react ?? NOOP;
}

export interface CompanionView {
  /** The picture that shows now: the reaction's, else the base pose. */
  pose: MascotPose;
  /** The CSS motion class playing now: the reaction's one-shot, else the resting breath (or the looping think). */
  motion: string;
  /** `data-react`: the reaction's pose while one is playing, else "". */
  reacting: MascotPose | "";
  /** Bumped per reaction; use as a React `key` so the same reaction replays its motion. */
  nonce: number;
  /** The bubble's line: a reaction's, else the screen's idle line. */
  line: string | null;
  phoneLine: string | null;
  /** The screen's base pose (the dock plays its entry motion from it). */
  base: MascotPose;
}

/** What the dock, the head and the caption draw; null when there is no companion or no screen has declared a scene yet. */
export function useCompanionView(): CompanionView | null {
  const ctx = useContext(StateCtx);
  if (!ctx?.scene) return null;
  const { scene, reaction, reactionLine } = ctx;
  const pose = reaction?.pose ?? scene.pose;
  return {
    pose,
    motion: reaction ? POSE_MOTION[reaction.pose] : restingMotion(scene.pose),
    reacting: reaction?.pose ?? "",
    nonce: reaction?.n ?? 0,
    line: reactionLine?.line ?? scene.line,
    phoneLine: reactionLine?.phoneLine ?? scene.phoneLine,
    base: scene.pose,
  };
}
