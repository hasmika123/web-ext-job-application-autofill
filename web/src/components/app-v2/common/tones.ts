/**
 * Tone palette shared by every app-v2 primitive. Class names are written out in full (Tailwind
 * only emits utilities it can see), and resolve against the `.theme-v2` tokens.
 */
export type Tone = "blue" | "green" | "amber" | "violet" | "teal" | "coral" | "pink" | "lime" | "slate";

export interface ToneClasses {
  /** Tinted background. */
  soft: string;
  /** AA text colour on the tint. */
  ink: string;
  /** Solid fill (bars, dots). */
  solid: string;
  /** The raw colour, for gradients / inline styles. */
  color: string;
}

export const TONE: Record<Tone, ToneClasses> = {
  blue: { soft: "bg-v2-blue-soft", ink: "text-v2-blue-ink", solid: "bg-v2-blue", color: "var(--color-v2-blue)" },
  green: { soft: "bg-v2-green-soft", ink: "text-v2-green-ink", solid: "bg-v2-green", color: "var(--color-v2-green)" },
  amber: { soft: "bg-v2-amber-soft", ink: "text-v2-amber-ink", solid: "bg-v2-amber", color: "var(--color-v2-amber)" },
  violet: { soft: "bg-v2-violet-soft", ink: "text-v2-violet-ink", solid: "bg-v2-violet", color: "var(--color-v2-violet)" },
  teal: { soft: "bg-v2-teal-soft", ink: "text-v2-teal-ink", solid: "bg-v2-teal", color: "var(--color-v2-teal)" },
  coral: { soft: "bg-v2-coral-soft", ink: "text-v2-coral-ink", solid: "bg-v2-coral", color: "var(--color-v2-coral)" },
  pink: { soft: "bg-v2-pink-soft", ink: "text-v2-pink-ink", solid: "bg-v2-pink", color: "var(--color-v2-pink)" },
  lime: { soft: "bg-v2-lime-soft", ink: "text-v2-green-ink", solid: "bg-v2-lime", color: "var(--color-v2-lime)" },
  slate: { soft: "bg-paper-2", ink: "text-ink-soft", solid: "bg-v2-muted", color: "var(--color-v2-muted)" },
};

const CYCLE: Tone[] = ["blue", "green", "amber", "violet", "teal", "coral", "pink"];

/** A stable tone for a string (avatars, company tiles) so the same name is always the same colour. */
export function toneFor(name: string): Tone {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CYCLE[h % CYCLE.length];
}
