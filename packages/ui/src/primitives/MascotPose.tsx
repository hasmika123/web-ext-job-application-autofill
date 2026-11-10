"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import useReducedMotion from "./useReducedMotion";

/**
 * MascotPose - the ENTERPRISE bee (X2.8; docs/enterprise-v2/11-branding-and-login.md section 6). One shared character with a
 * FIXED pose map, so no surface path-hunts for art. It is for the enterprise (tenant) portals ONLY: the regular Kiwiply
 * mascot (`public/v2/mascot-*.png`, `MascotCheer`) is a different character and is never replaced by this.
 *
 *   <MascotPose pose="empty" size="md" />
 *
 * - Poses are keyed by MEANING (`welcome`, `greet`, `empty`, `encourage`, `celebrate`, `warn`, `error`, `peek` plus a few
 *   more, see `MASCOT_POSES`); the map holds the file, its native size and the motion class. Replacing art is a one-line
 *   change in the map (or a file dropped over the same name), and every usage follows.
 * - Where the files live is the host's decision: `MascotProvider base="/ent/bee"` (default) or the `base` prop. The web serves
 *   them from `public/ent/bee`; the extension would pass its own bundle path if it ever rendered one.
 * - Sizes: `sm` 48 / `md` 80 / `lg` 120 px TALL; width follows the native aspect ratio. On a phone `lg` is capped at `md`.
 * - Decorative: `alt=""` and `aria-hidden`. Lazy-loaded except `welcome` (the login's first paint).
 * - The motion class (the global `ob-m-*` keyframes in the web's `onboarding-delight.css`) is applied only when the person has
 *   not asked for reduced motion.
 *
 * Usage caps (requirements 3.5, doc 11 section 6): at most ONE mascot per viewport; never inside tables or list rows; never in
 * the sidebar except the "Need help?" card. A web lint rule warns on two in one page file.
 */

export type EnterprisePose =
  | "welcome"
  | "greet"
  | "empty"
  | "encourage"
  | "celebrate"
  | "warn"
  | "error"
  | "peek"
  | "thinking"
  | "searching"
  | "secure"
  | "success"
  | "sad"
  | "goodbye"
  | "onboarding"
  | "collaboration"
  | "resume";

export interface PoseDef {
  /** File name under the asset base (a `web/public/ent/bee/manifest.json` entry). */
  file: string;
  /** Native pixel size of that file (aspect ratio is preserved at every `size`). */
  w: number;
  h: number;
  /** A global motion class (`ob-m-*`), applied only without `prefers-reduced-motion`. */
  motion: string;
}

/** The pose map. Keys are meanings; values are the bee art. The meaning of each pose is in the trailing comment. */
export const MASCOT_POSES: Record<EnterprisePose, PoseDef> = {
  welcome: { file: "welcome.png", w: 172, h: 205, motion: "ob-m-wave" }, // login
  greet: { file: "happy.png", w: 159, h: 204, motion: "ob-m-idle" }, // dashboard hero, first visit of the day
  empty: { file: "confused.png", w: 178, h: 198, motion: "ob-m-peek" }, // EmptyState slot ("nothing here yet")
  encourage: { file: "confident.png", w: 155, h: 218, motion: "ob-m-think" }, // readiness checklist, interview prep
  celebrate: { file: "great-job.png", w: 182, h: 195, motion: "ob-m-cheer" }, // placement / hire / first invite accepted
  warn: { file: "surprised.png", w: 169, h: 195, motion: "ob-m-idle" }, // paused domain, PAST_DUE banner
  error: { file: "error-oops.png", w: 181, h: 198, motion: "ob-m-shrug" }, // ErrorState slot ("all good, try again")
  peek: { file: "peeping-left.png", w: 224, h: 302, motion: "ob-m-peek" }, // not-a-member panel, side cards
  thinking: { file: "thinking.png", w: 167, h: 204, motion: "ob-m-think" }, // loading and matching
  searching: { file: "searching.png", w: 178, h: 194, motion: "ob-m-look" }, // search with no results yet
  secure: { file: "secure.png", w: 178, h: 194, motion: "ob-m-idle" }, // security pages
  success: { file: "task-complete.png", w: 156, h: 198, motion: "ob-m-cheer" }, // saved and submitted
  sad: { file: "sad.png", w: 157, h: 198, motion: "ob-m-shrug" }, // offboarding
  goodbye: { file: "goodbye-sign-out.png", w: 147, h: 194, motion: "ob-m-wave" }, // sign out
  onboarding: { file: "onboarding.png", w: 200, h: 193, motion: "ob-m-idle" }, // invites
  collaboration: { file: "collaboration.png", w: 220, h: 181, motion: "ob-m-idle" }, // teams
  resume: { file: "resume-help.png", w: 172, h: 194, motion: "ob-m-idle" }, // resume pages
};

export const POSE_KEYS = Object.keys(MASCOT_POSES) as EnterprisePose[];

export type MascotSize = "sm" | "md" | "lg";

/** Rendered HEIGHT in px per size (doc 11 section 6). */
export const MASCOT_HEIGHT: Record<MascotSize, number> = { sm: 48, md: 80, lg: 120 };

/** Where the bee files are served from unless the host says otherwise (`web/public/ent/bee`). */
export const DEFAULT_MASCOT_BASE = "/ent/bee";

const BaseContext = createContext<string>(DEFAULT_MASCOT_BASE);

/** The host (web tenant layout, a test, the extension) says where the pose files live. */
export function MascotProvider({ base = DEFAULT_MASCOT_BASE, children }: { base?: string; children: ReactNode }) {
  return <BaseContext.Provider value={base}>{children}</BaseContext.Provider>;
}

export function useMascotBase(): string {
  return useContext(BaseContext);
}

/** `base` + `/` + the pose's file, tolerant of a trailing slash on `base`. */
export function poseUrl(pose: EnterprisePose, base: string = DEFAULT_MASCOT_BASE): string {
  return `${base.replace(/\/+$/, "")}/${MASCOT_POSES[pose].file}`;
}

/** The rendered size in px for a pose at `size`: height from the table, width from the native aspect ratio. */
export function poseSize(pose: EnterprisePose, size: MascotSize): { width: number; height: number } {
  const def = MASCOT_POSES[pose];
  const height = MASCOT_HEIGHT[size];
  return { width: Math.round((def.w / def.h) * height), height };
}

export interface MascotPoseProps {
  pose: EnterprisePose;
  size?: MascotSize;
  /** Overrides the provider's base for this one image. */
  base?: string;
  className?: string;
}

export default function MascotPose({ pose, size = "md", base, className }: MascotPoseProps) {
  const reduced = useReducedMotion();
  const ctxBase = useMascotBase();
  const def = MASCOT_POSES[pose];
  const { width, height } = poseSize(pose, size);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- packages/ui is framework-free (web and the extension both consume it as source)
    <img
      src={poseUrl(pose, base ?? ctxBase)}
      alt=""
      aria-hidden
      width={width}
      height={height}
      loading={pose === "welcome" ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      data-mascot-pose={pose}
      data-mascot-size={size}
      style={{ aspectRatio: `${def.w} / ${def.h}` }}
      // `lg` is capped at `md` on a phone (CSS only: a 120 px bee must not crowd a 360 px screen).
      className={cn("pointer-events-none inline-block flex-none select-none object-contain", size === "lg" && "max-sm:h-20 max-sm:w-auto", !reduced && def.motion, className)}
    />
  );
}

/* ── celebrations fire once per event ─────────────────────────────────────────────── */

const CELEBRATED_KEY = "kiwiply:ent:celebrated";

/**
 * `celebrate(eventId)`: true the FIRST time this session sees `eventId`, false after, so a placement's confetti and cheering
 * bee fire once however often the page re-renders or remounts. Deduped in `sessionStorage` (try/catch: with storage blocked
 * it falls back to a per-page-load memory, so it still never repeats within a load).
 */
const memory = new Set<string>();
export function celebrate(eventId: string): boolean {
  if (memory.has(eventId)) return false;
  memory.add(eventId);
  try {
    const seen: string[] = JSON.parse(window.sessionStorage.getItem(CELEBRATED_KEY) ?? "[]");
    if (seen.includes(eventId)) return false;
    window.sessionStorage.setItem(CELEBRATED_KEY, JSON.stringify([...seen, eventId].slice(-100)));
  } catch {
    // storage unavailable (private window, SSR): the in-memory set above is the whole dedupe
  }
  return true;
}
