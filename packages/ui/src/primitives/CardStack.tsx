"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";
import useReducedMotion from "./useReducedMotion";

/**
 * CardStack - one live card with up to two blank "ghosts" peeking out underneath, so a pile of cards reads as a pile and the
 * next one springs up when this one goes (the onboarding review as a game, ONBOARDING-DELIGHT-DESIGN 3.1 / 9.2).
 *
 *   <CardStack ghosts={2} cardKey={card.id} leaving={leaving} onLeft={() => setLeaving(null)}>
 *     <SwipeCard ...>...</SwipeCard>
 *   </CardStack>
 *
 * - The box always reserves `pb-5` (20 px) for the two ghost offsets, so the stack is the card's height + 20 px whether it
 *   shows 0, 1 or 2 ghosts: nothing shifts as ghosts come and go. Ghosts are blank paper (`aria-hidden`, no content: nothing about
 *   the next card is in the DOM before the person reaches it).
 * - A decision hands the card that just left as `leaving`: it is drawn on top for 240 ms, flying off to its side
 *   (`kiwi-fling-right` / `-left`), `pointer-events-none` and `aria-hidden`, then `onLeft` is called. It is only a picture: the
 *   live card underneath is already the next one and is interactive from the first frame.
 * - When `cardKey` changes the new live card springs up from the first ghost's place (200 ms, one soft overshoot) and the ghosts
 *   slide up with it. Not on first mount: arriving on the screen is the screen's own entrance.
 * - Under `prefers-reduced-motion` nothing flies or springs: the leaving card is shown still for 120 ms (its stamp is the
 *   feedback), the incoming one crossfades in over 120 ms and the ghosts are static (they still say "more to come").
 *
 * The motion lives in `styles/delight.css`; without it everything is the static twin.
 */
export interface CardStackProps {
  /** How many ghosts to draw: `min(2, cardsLeft - 1)`. */
  ghosts: 0 | 1 | 2;
  /** Identity of the live card; a change plays the spring-up. */
  cardKey: string | number;
  /** The card that just left, for its fly-off. `from` is the drag offset in px it should start from (0 for a button or a key). */
  leaving?: { key: string | number; node: ReactNode; dir: "keep" | "skip"; from?: number } | null;
  /** Called when the fly-off is over (the host drops `leaving`). */
  onLeft?: () => void;
  /** Drawn over the stack, inside its box (sparkles from the card's centre; a badge on its edge). Never affects layout. */
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** How long the fly-off layer stays (ms): the fling's own duration; a still 120 ms under reduced motion. */
export const FLING_MS = 240;
export const FLING_STILL_MS = 120;

export default function CardStack({ ghosts, cardKey, leaving = null, onLeft, overlay, children, className }: CardStackProps) {
  const reduced = useReducedMotion();
  // The spring plays once the card has changed at least once, never on arrival (the screen has its own entrance).
  const [seen, setSeen] = useState(cardKey);
  const [springs, setSprings] = useState(false);
  if (seen !== cardKey) {
    setSeen(cardKey);
    setSprings(true);
  }

  const onLeftRef = useRef(onLeft);
  useEffect(() => {
    onLeftRef.current = onLeft;
  });
  const leavingKey = leaving?.key;
  useEffect(() => {
    if (leavingKey === undefined) return;
    const t = setTimeout(() => onLeftRef.current?.(), reduced ? FLING_STILL_MS : FLING_MS);
    return () => clearTimeout(t);
  }, [leavingKey, reduced]);

  return (
    <div data-card-stack className={cn("relative pb-5", className)}>
      {ghosts >= 2 && <Ghost n={2} cardKey={cardKey} springs={springs} />}
      {ghosts >= 1 && <Ghost n={1} cardKey={cardKey} springs={springs} />}
      <div key={cardKey} data-stack-live className={cn("relative z-[3]", springs && "kiwi-stack-in")}>
        {children}
      </div>
      {leaving && (
        <div
          key={leaving.key}
          data-fling={leaving.dir}
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-x-0 top-0 z-[4]", !reduced && (leaving.dir === "keep" ? "kiwi-fling-right" : "kiwi-fling-left"))}
          style={leaving.from ? ({ ["--kiwi-fling-from"]: Math.round(leaving.from) } as CSSProperties) : undefined}
        >
          {leaving.node}
        </div>
      )}
      {overlay}
    </div>
  );
}

function Ghost({ n, cardKey, springs }: { n: 1 | 2; cardKey: string | number; springs: boolean }) {
  return (
    <div
      key={`${n}-${cardKey}`}
      data-ghost={n}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 bottom-5 origin-bottom rounded-2xl border border-line bg-paper shadow-[0_3px_8px_rgba(27,31,94,0.12)]",
        n === 1 ? "z-[2]" : "z-[1]",
        springs && (n === 1 ? "kiwi-ghost-1-in" : "kiwi-ghost-2-in"),
      )}
      // Inline, not utilities: the keyframes animate `transform`, and Tailwind's translate / scale are separate properties that would stack on it.
      style={n === 1 ? { transform: "translateY(10px) scale(.96)", opacity: 0.75 } : { transform: "translateY(20px) scale(.92)", opacity: 0.45 }}
    />
  );
}
