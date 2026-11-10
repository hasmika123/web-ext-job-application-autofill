"use client";

/**
 * The delight layer's one reader (R1.14, ONBOARDING-DELIGHT-DESIGN 8): `useDelight()` answers "is this on, and how loud?" for
 * every screen from `config.onboarding.delight`, plus the mascot switch, the reduced-motion preference, the copy deck and the
 * haptic tap. `ProfileSetup` provides it once through {@link DelightProvider}, so every screen and the shell read the same
 * answer. Outside a provider (a unit test of one screen, the dashboard card) everything is OFF, which is exactly today's flow:
 * remove every setting and the v2 flow is what it was (DESIGN principle 8).
 */
import { createContext, createElement, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useReducedMotion } from "@kiwiply/ui";
import { delightOf, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { resolveCopy, warnUnknownOverrides, type CopyValue, type CopyVars } from "./delight-copy";

export type HapticKind = "decision" | "milestone" | "payoff";

/** `navigator.vibrate` patterns (DESIGN 3.5): 10 ms on a decision, 20 ms on a milestone, a double tap on the payoff. */
export const HAPTIC_PATTERN: Record<HapticKind, number | number[]> = {
  decision: 10,
  milestone: 20,
  payoff: [10, 40, 10],
};

/**
 * Vibrate for `kind`, only when ALL of these hold: the admin's `haptics` is on, the person has not asked for less motion, the
 * browser has `vibrate` (iOS Safari does not, so it is silently quiet there) and the pointer is coarse (a phone, not a mouse).
 * Wrapped in try/catch; returns whether it vibrated.
 */
export function tapHaptic(kind: HapticKind, opts: { haptics: boolean; reduced: boolean }): boolean {
  if (!opts.haptics || opts.reduced) return false;
  try {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return false;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function" || !window.matchMedia("(pointer: coarse)").matches) return false;
    return navigator.vibrate(HAPTIC_PATTERN[kind]);
  } catch {
    return false;
  }
}

export interface Delight {
  /** `config.onboarding.delight.enabled`: the whole layer. */
  on: boolean;
  /** The companion: delight on AND `config.onboarding.mascot`. */
  mascot: boolean;
  haptics: boolean;
  combo: boolean;
  highlights: boolean;
  milestones: boolean;
  interstitialMs: number;
  interstitials: string[];
  barRider: boolean;
  share: boolean;
  /** `prefers-reduced-motion: reduce` (the one source: `useReducedMotion`). */
  reduced: boolean;
  /** A line of the deck (the admin's override first); lists rotate by `seed`. */
  copy: (key: string, vars?: CopyVars, seed?: number) => string;
  /** The same line for a phone caption: the `.phone` twin when there is one. */
  phoneCopy: (key: string, vars?: CopyVars, seed?: number) => string;
  /** A short vibration; false when any guard says no. */
  tap: (kind: HapticKind) => boolean;
}

const OFF: Delight = {
  on: false,
  mascot: false,
  haptics: false,
  combo: false,
  highlights: false,
  milestones: false,
  interstitialMs: 0,
  interstitials: [],
  barRider: false,
  share: false,
  reduced: false,
  copy: (key, vars, seed) => resolveCopy(key, { vars, seed }),
  phoneCopy: (key, vars, seed) => resolveCopy(key, { vars, seed, phone: true }),
  tap: () => false,
};

const Ctx = createContext<Delight>(OFF);

export function DelightProvider({ config, children }: { config: Pick<ResumeBuilderConfig, "onboarding"> | null | undefined; children: ReactNode }) {
  const reduced = useReducedMotion();
  const d = delightOf(config);
  const mascotSwitch = config?.onboarding?.mascot ?? true;
  const overrides = d.copy as Record<string, CopyValue>;
  // The settings object is rebuilt per render by callers; the pieces that matter are primitives and the copy map.
  const { enabled, haptics, combo, highlights, milestones, interstitialMs, barRider, share } = d;
  const interstitialsKey = d.interstitials.join(",");

  useEffect(() => {
    warnUnknownOverrides(overrides);
  }, [overrides]);

  const value = useMemo<Delight>(() => {
    const on = enabled;
    return {
      on,
      mascot: on && mascotSwitch,
      haptics: on && haptics,
      combo: on && combo,
      highlights: on && highlights,
      milestones: on && milestones,
      interstitialMs: on ? interstitialMs : 0,
      interstitials: on ? (interstitialsKey ? interstitialsKey.split(",") : []) : [],
      barRider: on && barRider,
      share: on && share,
      reduced,
      copy: (key, vars, seed) => resolveCopy(key, { vars, seed, overrides }),
      phoneCopy: (key, vars, seed) => resolveCopy(key, { vars, seed, overrides, phone: true }),
      tap: (kind) => tapHaptic(kind, { haptics: on && haptics, reduced }),
    };
  }, [enabled, mascotSwitch, haptics, combo, highlights, milestones, interstitialMs, interstitialsKey, barRider, share, reduced, overrides]);

  return createElement(Ctx.Provider, { value }, children);
}

export function useDelight(): Delight {
  return useContext(Ctx);
}
