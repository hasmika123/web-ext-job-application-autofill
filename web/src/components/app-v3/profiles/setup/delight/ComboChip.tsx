"use client";

import { useEffect, useState } from "react";
import { AnimatedNumber, cn } from "@kiwiply/ui";
import { useDelight } from "@/lib/onboarding/delight";

/** How long the chip fades when the run ends (ms): quiet, no text, no "lost". */
export const COMBO_FADE_MS = 200; // config-literal-ok: the design's 200 ms fade (DELIGHT 3.4)
/** The chip appears once this many Keeps in a row have happened. */
export const COMBO_FROM = 3;

/** Is `n` a count the companion cheers for: the 3rd, then every 5th after (8, 13, ...)? */
export const isComboMilestone = (n: number) => n === COMBO_FROM || (n > COMBO_FROM && (n - COMBO_FROM) % 5 === 0);

/**
 * "🔥 3 in a row" (R1.15, ONBOARDING-DELIGHT-DESIGN 3.4): a session-only count of consecutive Keeps on the review (an edit that is
 * then kept counts). NOT a streak: it is never saved, never leaves this screen, is not in the recap, carries no reward and is
 * never announced (`aria-hidden`). It appears at 3, pops (150 ms) on each further Keep with its number flipping, and on a Skip
 * simply fades out over 200 ms: no text, no colour change, no "lost". Undo does not bring it back: it counts taps in a row.
 *
 * Drawn as a small badge on the card stack's top edge (the host positions it), so appearing or leaving never moves the heading
 * row or the card (a chip in the wrapping heading row pushed the title onto a new line on a 360 px phone).
 * Gated by the host with `onboarding.delight.combo`.
 */
export default function ComboChip({ count, className }: { count: number; className?: string }) {
  const d = useDelight();
  const show = count >= COMBO_FROM;
  // The last count that was shown, kept for the fade-out so it does not flash "0".
  const [last, setLast] = useState(count);
  const [fading, setFading] = useState(false);
  if (show && last !== count) setLast(count);
  const [seenShow, setSeenShow] = useState(show);
  if (seenShow !== show) {
    setSeenShow(show);
    setFading(!show);
  }
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => setFading(false), COMBO_FADE_MS);
    return () => clearTimeout(t);
  }, [fading]);

  if (!show && !fading) return null;
  const n = show ? count : last;
  const SPLIT = "\u0001";
  const [pre, post] = d.copy("combo.chip", { n: SPLIT }).split(SPLIT);
  const [phonePre, phonePost] = d.phoneCopy("combo.chip", { n: SPLIT }).split(SPLIT);
  const number = <AnimatedNumber value={n} announce={false} />;
  return (
    <span
      aria-hidden="true"
      data-combo={n}
      data-fading={fading && !show ? "" : undefined}
      // Appearing re-keys it (a fresh pop); each further Keep swaps between two identical pop animations, which restarts it
      // without remounting, so the number inside can flip.
      key={show ? "on" : "off"}
      className={cn(
        "pointer-events-none inline-flex items-center whitespace-nowrap rounded-full border border-v2-amber/40 bg-v2-amber-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-v2-sticky-ink",
        show ? (n % 2 ? "ob-chip-pop" : "ob-chip-pop-b") : "kiwi-combo-fade",
        className,
      )}
    >
      <span className="hidden sm:inline">
        {pre}
        {number}
        {post}
      </span>
      <span className="sm:hidden">
        {phonePre}
        {number}
        {phonePost}
      </span>
    </span>
  );
}
