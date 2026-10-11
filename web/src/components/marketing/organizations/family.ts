/**
 * Colour families for the /organizations page. Class strings are written out in full so
 * Tailwind's scanner emits them (no string-built class names). `text` is a deepened shade so
 * small labels on the soft backgrounds stay AA.
 */
/** Headline green for accent words in h1/h2 (large text, AA on the canvas; the token is too light). */
export const HEADLINE_GREEN = "text-[#1A9A35]";

export type Family ="lime" | "green" | "violet" | "blue" | "teal" | "coral" | "amber" | "pink";

export interface FamilyClasses {
  /** Soft tint background. */
  soft: string;
  /** Solid fill (bars, dots). */
  solid: string;
  /** Icon colour on the soft tint. */
  icon: string;
  /** Deep text colour for labels on the soft tint. */
  text: string;
}

export const FAMILY: Record<Family, FamilyClasses> = {
  lime: { soft: "bg-v2-lime-soft", solid: "bg-v2-lime-deep", icon: "text-[#3E8F0E]", text: "text-[#2F6E0A]" },
  green: { soft: "bg-v2-green-soft", solid: "bg-v2-green", icon: "text-v2-green", text: "text-[#14702A]" },
  violet: { soft: "bg-v2-violet-soft", solid: "bg-v2-violet", icon: "text-v2-violet", text: "text-[#4B32C4]" },
  blue: { soft: "bg-v2-blue-soft", solid: "bg-v2-blue", icon: "text-v2-blue", text: "text-[#1349B5]" },
  teal: { soft: "bg-v2-teal-soft", solid: "bg-v2-teal", icon: "text-v2-teal", text: "text-[#0F6B66]" },
  coral: { soft: "bg-v2-coral-soft", solid: "bg-v2-coral", icon: "text-v2-coral", text: "text-[#B3261E]" },
  amber: { soft: "bg-v2-amber-soft", solid: "bg-v2-amber", icon: "text-[#C27A00]", text: "text-[#7A4F00]" },
  pink: { soft: "bg-v2-pink-soft", solid: "bg-v2-pink", icon: "text-v2-pink", text: "text-[#A3226F]" },
};
