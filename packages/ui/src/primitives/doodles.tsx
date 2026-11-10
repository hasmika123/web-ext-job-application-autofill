import type { ReactNode, SVGProps } from "react";

/**
 * Doodles — hand-drawn marketing decorations (landing v2). Stroke-based on `currentColor`,
 * decorative by default (`aria-hidden`), sized via `className` (`h-10 w-10`). Colour them with
 * a text-colour utility (`text-v2-green`). Like icons, they live here so web never inlines
 * an `<svg>` (see packages/ui/README.md).
 */
export type DoodleProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children">;

function Doodle({
  viewBox,
  children,
  className,
  ...props
}: DoodleProps & { viewBox: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

/** The three short "!!" lines radiating from a corner — emphasis burst. */
export function SparkBurst(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 48 48" {...props}>
      <path d="M26 5l-3 12" />
      <path d="M9 12l11 7" />
      <path d="M5 30l13-3" />
    </Doodle>
  );
}

export type CurvedArrowDirection = "down-right" | "down-left" | "up-right";

export interface CurvedArrowProps extends DoodleProps {
  /** Which way the swoop travels. Default `down-right`. */
  direction?: CurvedArrowDirection;
}

/** A swooping hand-drawn arrow, for chaining cards ("next step"). */
export function CurvedArrow({ direction = "down-right", ...props }: CurvedArrowProps) {
  switch (direction) {
    case "down-left":
      return (
        <Doodle viewBox="0 0 64 64" {...props}>
          <path d="M52 6C26 8 12 22 12 50" />
          <path d="M3 41l9 11 10-10" />
        </Doodle>
      );
    case "up-right":
      return (
        <Doodle viewBox="0 0 64 64" {...props}>
          <path d="M6 54C10 30 26 14 56 12" />
          <path d="M44 3l12 9-11 10" />
        </Doodle>
      );
    case "down-right":
    default:
      return (
        <Doodle viewBox="0 0 64 64" {...props}>
          <path d="M8 6c26 2 40 16 40 44" />
          <path d="M38 42l10 11 10-11" />
        </Doodle>
      );
  }
}

/** A wavy line. */
export function Squiggle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 96 24" {...props}>
      <path d="M4 14c6-12 10-12 14 0s10 12 14 0 10-12 14 0 10 12 14 0 10-12 14 0" />
    </Doodle>
  );
}

/** Five-point outline star. */
export function StarDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 48 48" strokeWidth={3.2} {...props}>
      <path d="M24 5l5.4 12.6 13.6 1.2-10.3 9 3.1 13.4L24 33.8 12.2 41.2l3.1-13.4-10.3-9 13.6-1.2z" />
    </Doodle>
  );
}

/** A hand-drawn three-point crown (the signup board's "you're a winner" doodle). */
export function CrownDoodle(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 64 48" strokeWidth={3} {...props}>
      <path d="M9 38L6 13l14 13 12-18 12 18 14-13-3 25z" />
      <path d="M12 44h40" />
    </Doodle>
  );
}

/** A paper plane with a dotted flight trail. */
export function PaperPlane(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 120 64" strokeWidth={2.6} {...props}>
      {/* trail */}
      <path d="M6 56c14 6 26-2 30-16s14-20 28-18" strokeDasharray="1 7" />
      {/* plane */}
      <path d="M112 6L66 22l16 8 8 14z" />
      <path d="M112 6L82 30" />
      <path d="M82 30l-2 12 10-6" />
    </Doodle>
  );
}

/** Three short confetti ticks. */
export function Confetti(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 48 48" {...props}>
      <path d="M8 12l7 4" />
      <path d="M30 6l-2 8" />
      <path d="M38 26l-8 3" />
      <path d="M16 38l4-7" />
    </Doodle>
  );
}

/** Rough single underline for a headline word. Stretches to the width of its box. */
export function Underline(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 200 16" preserveAspectRatio="none" strokeWidth={4} {...props}>
      <path d="M4 10C40 4 80 12 120 7s56-1 76 3" />
    </Doodle>
  );
}

/** A loose hand-drawn ring (circle a word or number). Stretches to its box. */
export function CircleScribble(props: DoodleProps) {
  return (
    <Doodle viewBox="0 0 120 64" preserveAspectRatio="none" strokeWidth={3} {...props}>
      <path d="M62 5C32 4 6 16 7 34s30 26 60 24c28-2 48-14 46-30S92 3 56 8" />
    </Doodle>
  );
}

const MASCOT_BODY = "var(--color-accent)";
const MASCOT_BELLY = "var(--color-accent-soft)";
const MASCOT_INK = "var(--color-on-accent)";

/**
 * The Kiwiply mascot cheering, with a couple of sparkles (the Resume Builder's Insights card, DESIGN
 * 10.7). Unlike the stroke doodles it is a small filled illustration in the kiwi accent colours; it is
 * decorative (`aria-hidden`) and sized with `className` (`h-20 w-20`).
 */
export function MascotCheer({ className, ...props }: DoodleProps) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden focusable="false" className={className} {...props}>
      {/* sparkles */}
      <path d="M80 8l2.6 7.4L90 18l-7.4 2.6L80 28l-2.6-7.4L70 18l7.4-2.6z" fill="#F5C842" />
      <path d="M12 30l1.8 5.2L19 37l-5.2 1.8L12 44l-1.8-5.2L5 37l5.2-1.8z" fill="#F5C842" />
      {/* arms up */}
      <path d="M22 52c-8-4-12-12-10-20" stroke={MASCOT_BODY} strokeWidth={8} strokeLinecap="round" fill="none" />
      <path d="M74 52c8-4 12-12 10-20" stroke={MASCOT_BODY} strokeWidth={8} strokeLinecap="round" fill="none" />
      {/* leaf sprout */}
      <path d="M48 18c-2-7 2-13 10-14 1 8-3 13-10 14z" fill={MASCOT_BODY} stroke={MASCOT_INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M48 18c-6-1-10-5-10-11 7 0 11 4 10 11z" fill={MASCOT_BELLY} stroke={MASCOT_INK} strokeWidth={2} strokeLinejoin="round" />
      {/* body */}
      <ellipse cx="48" cy="56" rx="29" ry="30" fill={MASCOT_BODY} stroke={MASCOT_INK} strokeWidth={2.5} />
      <ellipse cx="48" cy="66" rx="19" ry="17" fill={MASCOT_BELLY} />
      {/* face */}
      <ellipse cx="38" cy="50" rx="3.4" ry="4.4" fill={MASCOT_INK} />
      <ellipse cx="58" cy="50" rx="3.4" ry="4.4" fill={MASCOT_INK} />
      <circle cx="39" cy="48.5" r="1.1" fill="#fff" />
      <circle cx="59" cy="48.5" r="1.1" fill="#fff" />
      <path d="M40 60c3 5 13 5 16 0" stroke={MASCOT_INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <ellipse cx="31" cy="58" rx="4" ry="2.6" fill="#F4A6A0" opacity={0.7} />
      <ellipse cx="65" cy="58" rx="4" ry="2.6" fill="#F4A6A0" opacity={0.7} />
      {/* feet */}
      <ellipse cx="36" cy="86" rx="8" ry="4" fill={MASCOT_INK} />
      <ellipse cx="60" cy="86" rx="8" ry="4" fill={MASCOT_INK} />
    </svg>
  );
}
