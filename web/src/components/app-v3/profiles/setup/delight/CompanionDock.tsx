"use client";

import Image from "next/image";
import { SpeechBubble, cn } from "@kiwiply/ui";
import { MASCOT_ART } from "../mascot-art";
import { useCompanionActive, useCompanionView, type CompanionView } from "./Companion";
import { POSE_ART } from "./poses";

/**
 * The companion on screen (R1.14, ONBOARDING-DELIGHT-DESIGN 2.2 / 2.3). One {@link useCompanionView}, three tiers by window width,
 * each with a real speech bubble (a tinted bubble with a tail, never a grey subtitle):
 *
 *  - from `xl` (1280): {@link CompanionDock}, a 200 px column right of the 560 px setup column - a 120 px lime disc with the
 *    mascot (104 px tall, bottom-aligned) and the bubble under it;
 *  - `md` to `xl` (768-1279, a laptop with a side panel open, a tablet): {@link CompanionMid} in the heading row - a 104 px
 *    disc with a bubble to its left, so there is a mascot with something to say where the window has no room for a column;
 *  - below `md` (phones): {@link CompanionHead}, a 44 px round head in the heading row, and {@link CompanionCaption}, the
 *    bubble's line as a one-line tinted bubble under the row (18 px of text, space always reserved).
 *
 * All of it is decorative: `aria-hidden` and `pointer-events-none`, so a screen reader never hears "That's a keeper." on top
 * of the real "Kept Acme. Education 2 of 8." and the companion can never sit between a finger and a control (DESIGN 2.6). Each
 * view reserves its space even before a screen has declared a pose, so nothing shifts when the first line arrives.
 */

function Art({ view, className }: { view: CompanionView; className?: string }) {
  const [src, width, height] = MASCOT_ART[POSE_ART[view.pose]];
  // Keyed on the reaction so a repeated reaction replays its motion; the class is the pose's CSS motion (none under reduced motion).
  return <Image key={view.nonce} src={src} alt="" aria-hidden width={width} height={height} className={cn("flex-none object-contain", view.motion, className)} />;
}

/** The entry motion of a screen: a wave for the greeting, a dance for the payoff, otherwise the mascot peeks up (once, CSS only). */
const entryClass = (base: CompanionView["base"]) => (base === "wave" ? "ob-m-wave" : base === "celebrate" ? "ob-m-dance" : "ob-m-peek");

/** The lime disc with the mascot in it, at `size` px (art 87 % of it, bottom-aligned). */
function Disc({ view, screenKey, size }: { view: CompanionView | null; screenKey?: string; size: 104 | 120 }) {
  return (
    <div
      className={cn("flex flex-none items-end justify-center overflow-hidden rounded-full bg-v2-lime-soft/60", size === 120 ? "h-[120px] w-[120px]" : "h-[104px] w-[104px]")}
    >
      {view && (
        <div key={screenKey} className={cn("flex items-end", entryClass(view.base))}>
          <Art view={view} className={size === 120 ? "h-[104px] w-auto" : "h-[90px] w-auto"} />
        </div>
      )}
    </div>
  );
}

export function CompanionDock({ screenKey, className }: { screenKey: string; className?: string }) {
  const view = useCompanionView();
  const active = useCompanionActive();
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="companion-dock"
      data-pose={view?.pose ?? ""}
      data-react={view?.reacting ?? ""}
      className={cn("pointer-events-none absolute left-full top-[52px] ml-8 hidden w-[200px] flex-col items-center gap-4 xl:flex", className)}
    >
      <Disc view={view} screenKey={screenKey} size={120} />
      <div className="w-full max-w-[180px]" style={{ minHeight: 48 }}>
        {view?.line ? <SpeechBubble tail="up">{view.line}</SpeechBubble> : null}
      </div>
    </div>
  );
}

/** The 768-1279 tier: a medium mascot at the end of the heading row with its bubble on its left. */
export function CompanionMid({ className }: { className?: string }) {
  const view = useCompanionView();
  const active = useCompanionActive();
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="companion-mid"
      data-pose={view?.pose ?? ""}
      data-react={view?.reacting ?? ""}
      className={cn("pointer-events-none hidden flex-none items-center gap-3 md:flex xl:hidden", className)}
      style={{ height: 104 }} // the disc's height, reserved: a bubble growing to three lines (about 72 px) never moves the row
    >
      <div className="w-[158px]">{view?.line ? <SpeechBubble tail="right">{view.line}</SpeechBubble> : null}</div>
      <Disc view={view} size={104} />
    </div>
  );
}

export function CompanionHead({ className }: { className?: string }) {
  const view = useCompanionView();
  const active = useCompanionActive();
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="companion-head"
      data-pose={view?.pose ?? ""}
      data-react={view?.reacting ?? ""}
      className={cn("pointer-events-none relative h-11 w-11 flex-none overflow-hidden rounded-full bg-v2-lime-soft/60 md:hidden", className)}
    >
      {view && (
        <div className={cn("absolute inset-x-0 top-[3px] flex justify-center", entryClass(view.base))}>
          <Art view={view} className="h-[58px] w-auto max-w-none" />
        </div>
      )}
    </div>
  );
}

/** The phone tier's speech: the bubble's line as a one-line tinted bubble under the heading row, its tail pointing at the head. */
export function CompanionCaption({ className }: { className?: string }) {
  const view = useCompanionView();
  const active = useCompanionActive();
  if (!active) return null;
  return (
    <div aria-hidden="true" data-testid="companion-caption" className={cn("pointer-events-none flex min-h-[42px] min-w-0 justify-end pt-2.5 md:hidden", className)}>
      {view?.phoneLine ? (
        <SpeechBubble tail="up-right" reservedLines={1} textKey={view.phoneLine} className="min-w-0 max-w-full py-1.5 text-[12.5px] leading-[18px]">
          <span className="block truncate">{view.phoneLine}</span>
        </SpeechBubble>
      ) : null}
    </div>
  );
}
