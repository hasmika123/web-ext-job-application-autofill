/**
 * Accent families for the landing v2 marketing pieces (spec section 2.1). One map so Eyebrow,
 * Handwritten, FloatingCard and the hero headline all agree. Class names are written out in
 * full (Tailwind scans source text; it cannot see composed names).
 *
 * `deep` / `headline` use darker shades than the brand tokens where the token itself would miss
 * WCAG AA on its own soft tint (spec section 11: "coloured words use the deep values").
 */
export type Family = "lime" | "green" | "violet" | "blue" | "teal" | "coral" | "amber" | "pink";

export interface FamilyClasses {
  /** Soft tint background (pills, icon tiles). */
  soft: string;
  /** Brand colour for an icon glyph sitting on `soft`. */
  icon: string;
  /** Text colour that is AA on `soft` (eyebrows, badges). */
  deep: string;
  /** Text colour for large headline words / handwriting on the canvas. */
  headline: string;
}

export const FAMILY: Record<Family, FamilyClasses> = {
  lime: { soft: "bg-v2-lime-soft", icon: "text-[#3E8F0E]", deep: "text-[#3E8F0E]", headline: "text-[#3E8F0E]" },
  green: { soft: "bg-v2-green-soft", icon: "text-v2-green", deep: "text-[#157A2B]", headline: "text-[#1A9A35]" },
  violet: { soft: "bg-v2-violet-soft", icon: "text-v2-violet", deep: "text-[#5B3FE0]", headline: "text-v2-violet" },
  blue: { soft: "bg-v2-blue-soft", icon: "text-v2-blue", deep: "text-[#1A5BD6]", headline: "text-v2-blue" },
  teal: { soft: "bg-v2-teal-soft", icon: "text-v2-teal", deep: "text-[#0E7A75]", headline: "text-[#158F89]" },
  coral: { soft: "bg-v2-coral-soft", icon: "text-v2-coral", deep: "text-[#C93636]", headline: "text-v2-coral" },
  amber: { soft: "bg-v2-amber-soft", icon: "text-v2-amber", deep: "text-[#9A5B00]", headline: "text-[#B26B00]" },
  pink: { soft: "bg-v2-pink-soft", icon: "text-v2-pink", deep: "text-[#B72A80]", headline: "text-v2-pink" },
};
