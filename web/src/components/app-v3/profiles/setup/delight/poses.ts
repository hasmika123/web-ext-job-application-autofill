/**
 * The companion's poses (R1.14, ONBOARDING-DELIGHT-DESIGN 2.1 / 2.4): which existing art stands in for each pose, and which CSS
 * motion plays for it. There is no shrug / think / unclipped cheer art yet (DESIGN 2.7 lists what the user can produce), so a
 * pose is "an existing picture + a CSS motion"; swapping in new art later is ONE line of {@link POSE_ART}.
 */
import type { MascotName } from "../mascot-art";

export type MascotPose = "idle" | "peek" | "cheer" | "shrug" | "think" | "look" | "read" | "grad" | "laptop" | "celebrate" | "wave";

/** The picture that shows for each pose. `wave` stands in for `idle` and `shrug` (the wink reads as "all good"). */
export const POSE_ART: Record<MascotPose, MascotName> = {
  wave: "wave",
  idle: "wave",
  peek: "peek",
  cheer: "clap",
  shrug: "wave",
  think: "books",
  look: "binoculars",
  read: "resume",
  grad: "grad",
  laptop: "laptopWave",
  celebrate: "clap",
};

/** The CSS class that animates the picture for each pose (`globals.css`, `ob-m-*`; nothing plays under reduced motion). */
export const POSE_MOTION: Record<MascotPose, string> = {
  wave: "ob-m-wave",
  idle: "ob-m-idle",
  peek: "ob-m-peek",
  cheer: "ob-m-cheer",
  shrug: "ob-m-shrug",
  think: "ob-m-think",
  look: "ob-m-look",
  read: "ob-m-idle",
  grad: "ob-m-cheer",
  laptop: "ob-m-idle",
  celebrate: "ob-m-dance",
};

/** How long each one-shot motion runs (ms) - the keyframe's own duration, so `data-react` can clear when it ends. */
export const REACT_MS: Record<MascotPose, number> = {
  wave: 600,
  idle: 0,
  peek: 240,
  cheer: 480,
  shrug: 300,
  think: 0,
  look: 800,
  read: 0,
  grad: 480,
  laptop: 0,
  celebrate: 900,
};

/**
 * A picture stays up at least this long after a reaction (ms), even for the shortest motion: a 240 ms art swap would be a
 * flicker, and under reduced motion (where nothing moves) the swap is the only sign of the reaction.
 */
export const POSE_HOLD_MS = 900;

/** A reaction's line stays in the bubble this long (ms) before the screen's own line comes back. */
export const LINE_HOLD_MS = 2400;

/** Poses that loop on their own as the screen's resting state (everything else rests on the 3 s breath). */
export const LOOPING: ReadonlySet<MascotPose> = new Set(["think"]);

/** The resting motion class for a screen's base pose. */
export function restingMotion(pose: MascotPose): string {
  return LOOPING.has(pose) ? POSE_MOTION[pose] : "ob-m-idle";
}
