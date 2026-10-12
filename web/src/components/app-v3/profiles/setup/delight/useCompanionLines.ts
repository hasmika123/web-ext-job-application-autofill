"use client";

import { useCallback } from "react";
import { useDelight } from "@/lib/onboarding/delight";
import type { CopyVars } from "@/lib/onboarding/delight-copy";
import { useCompanionReact, useCompanionScene } from "./Companion";
import type { MascotPose } from "./poses";

/**
 * The two calls a screen makes, with the copy deck behind them (R1.14, ONBOARDING-DELIGHT-DESIGN 2.5):
 *
 *   useSceneLine("read", "source.idle")            // the screen's base pose + its idle line (key null = no line)
 *   const cheer = useReaction();  cheer("cheer", "review.keep", index)   // a one-shot reaction with a line from the deck
 *
 * Both are no-ops without a companion (delight off, mascot off, or outside the setup flow), so a screen calls them
 * unconditionally and its DOM stays what it was.
 */
export function useSceneLine(pose: MascotPose, key: string | null, opts: { seed?: number; vars?: CopyVars } = {}) {
  const d = useDelight();
  const line = key ? d.copy(key, opts.vars, opts.seed) : null;
  const phone = key ? d.phoneCopy(key, opts.vars, opts.seed) : null;
  useCompanionScene(pose, line, phone);
}

export function useReaction(): (pose: MascotPose, key?: string | null, seed?: number, vars?: CopyVars) => void {
  const d = useDelight();
  const react = useCompanionReact();
  return useCallback(
    (pose, key, seed, vars) => react(pose, key ? d.copy(key, vars, seed) : undefined, key ? d.phoneCopy(key, vars, seed) : undefined),
    [d, react],
  );
}
