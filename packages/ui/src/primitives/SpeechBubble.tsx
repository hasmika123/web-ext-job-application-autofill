import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * SpeechBubble - a small bubble with a tail, for a companion's one-liner (the onboarding mascot, ONBOARDING-DELIGHT-DESIGN
 * 2.2 / 2.3 / 9.1). A 12 px radius, a hairline border and a 10 px tail pointing at whoever is talking; `tone="tint"` (default)
 * tints it with the accent so it reads as the mascot speaking, `tone="paper"` is a plain white card.
 *
 * The box never changes size when the line does: `reservedLines` sets its minimum height (2 lines = 48 px, 1 line = 18 px), so
 * a line swapping for another, or clearing, cannot move anything below it. A new line crossfades in over 120 ms (the text is
 * re-keyed on `textKey`, or on the string itself); under `prefers-reduced-motion` it swaps instantly (the animation lives in
 * `styles/delight.css`, inside `no-preference`).
 *
 * A bubble is decoration. The caller marks the whole companion `aria-hidden` (a polite region saying "That's a keeper." on
 * every tap would bury the real announcement), so this primitive adds no role of its own.
 *
 *   <SpeechBubble tail="up-left">That's a keeper.</SpeechBubble>
 */
export interface SpeechBubbleProps {
  children: ReactNode;
  /** Where the 10 px tail points: up and left (default; the companion above), straight up, up and right, left or right. */
  tail?: "up-left" | "up" | "up-right" | "left" | "right";
  /** Minimum height in lines of text: 2 (48 px, default) or 1 (18 px). */
  reservedLines?: 1 | 2;
  /** "tint" (default): accent-tinted, the mascot's voice. "paper": plain white. */
  tone?: "tint" | "paper";
  /** Re-keys the text so a changed line crossfades; defaults to the children when they are a string. */
  textKey?: string | number;
  className?: string;
}

const TAIL = {
  "up-left": "-top-[6px] left-5 border-l border-t",
  up: "-top-[6px] left-1/2 -translate-x-1/2 border-l border-t",
  "up-right": "-top-[6px] right-5 border-l border-t",
  left: "-left-[6px] top-3 border-b border-l",
  right: "-right-[6px] top-3 border-r border-t",
} as const;

const TONE = {
  tint: { box: "border-accent/40 bg-accent-soft", tail: "border-accent/40 bg-accent-soft" },
  paper: { box: "border-line/70 bg-paper", tail: "border-line/70 bg-paper" },
} as const;

export default function SpeechBubble({ children, tail = "up-left", reservedLines = 2, tone = "tint", textKey, className }: SpeechBubbleProps) {
  const key = textKey ?? (typeof children === "string" ? children : undefined);
  return (
    <div
      data-speech-bubble
      data-lines={reservedLines}
      data-tone={tone}
      style={{ minHeight: reservedLines === 2 ? 48 : 18 }} // 2 lines of 13.5 px text + padding / 1 line of caption text
      className={cn("relative rounded-xl border px-3 py-2 text-[13.5px] leading-snug text-ink shadow-[0_2px_8px_rgba(27,31,94,0.06)]", TONE[tone].box, className)}
    >
      <span aria-hidden data-speech-tail className={cn("absolute h-[10px] w-[10px] rotate-45", TONE[tone].tail, TAIL[tail])} />
      <span key={key} className="kiwi-bubble-text relative block">
        {children}
      </span>
    </div>
  );
}
