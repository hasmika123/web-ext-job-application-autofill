/**
 * Honest highlights (R1.16, ONBOARDING-DELIGHT-DESIGN 6): the one small "nice!" a review card may carry, and the one tip it may
 * show. Pure functions of the card's own bullets - no AI, no network, nothing invented. A chip only ever names a thing that is
 * LITERALLY in the text (a number, a result verb, a leading verb); it never says a bullet is "strong" or "weak". The rules are
 * regexes and word lists versioned here and in the tests; they are deliberately not admin settings.
 *
 * Priority (highest first): number > outcome > lead > built. At most one chip per card: the first bullet matching the highest
 * rule that matches anywhere.
 */
import type { Candidate } from "@/lib/profile-setup/draft";

export type HighlightRule = "number" | "outcome" | "lead" | "built";

export interface Highlight {
  /** Index into the bullets passed in. */
  index: number;
  rule: HighlightRule;
  /** The copy-deck key of the chip text (`highlight.number` ...), so the admin's override applies. */
  label: `highlight.${HighlightRule}`;
}

/**
 * A figure a recruiter would call a number: a currency amount ($1.2M, EUR 40k, 3,000), a percentage, a multiplier (3x), a thousands
 * number (12,000), a count with a unit word from the design's list (40k, 8 users, 30 sessions), or "50+". A bare year (2019) and a date range
 * (Jun 2018 - Feb 2021, 2013-2017) are NOT numbers: they are checked out of the text first.
 */
const UNITS = "k|m|million|billion|users|customers|clients|people|students|teams?|countries|stores|hours|days|weeks|months|years|sessions|tickets|orders|requests";
const NUMBER_RE = new RegExp(
  [
    String.raw`[$€£]\s?\d[\d,.]*\s?(?:[kmb]\b)?`, // currency
    String.raw`\d[\d,.]*\s?%`, // percentage
    String.raw`\b\d+(?:\.\d+)?\s?x\b`, // multiplier
    String.raw`\b\d{1,3}(?:,\d{3})+\b`, // thousands
    String.raw`\b\d+(?:\.\d+)?\+`, // 50+
    String.raw`\b\d+(?:\.\d+)?\s?(?:${UNITS})\b`, // a count with a unit word
  ].join("|"),
  "i",
);

/** A year, a month-and-year, or a range between them: dates that look like numbers but are not. Stripped before the number test. */
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_RE = new RegExp(
  [
    String.raw`\b(?:${MONTH}\s+)?(?:19|20)\d{2}\b\s*(?:-|–|—|to)\s*(?:(?:${MONTH}\s+)?(?:19|20)\d{2}\b|present|current|now)`, // ranges
    String.raw`\b${MONTH}\s+(?:19|20)\d{2}\b`, // Mar 2021
    String.raw`\b(?:19|20)\d{2}\b`, // a bare year
  ].join("|"),
  "gi",
);

/** Does this bullet contain a real figure? Years and date ranges do not count. */
export function hasNumber(text: string): boolean {
  return NUMBER_RE.test(text.replace(DATE_RE, " "));
}

const OUTCOME_WORDS = [
  "increased", "reduced", "cut", "grew", "improved", "saved", "boosted", "doubled", "tripled", "halved", "accelerated",
  "decreased", "raised", "lowered", "drove", "generated", "won", "achieved", "exceeded", "lifted", "sped up",
];
const LEAD_WORDS = [
  "led", "lead", "managed", "mentored", "coached", "coordinated", "directed", "owned", "oversaw", "ran", "headed", "founded",
  "co-founded", "organized", "organised", "supervised", "trained", "chaired", "captained",
];
const BUILT_WORDS = [
  "built", "shipped", "launched", "designed", "created", "developed", "implemented", "automated", "delivered", "engineered",
  "released", "published", "deployed", "wrote", "prototyped", "migrated",
];

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
/** The word list anywhere in the text, as whole words ("cut" does not match "cute"). */
const OUTCOME_RE = new RegExp(String.raw`(?<![\p{L}\p{N}-])(?:${OUTCOME_WORDS.map(escape).join("|")})(?![\p{L}\p{N}-])`, "iu");
/** The word list at the START of the bullet (after a bullet glyph or space): "Led a team" is lead, "I led" and "Misled" are not. */
const LEAD_RE = new RegExp(String.raw`^[\s•*·\-–—]*(?:${LEAD_WORDS.map(escape).join("|")})(?![\p{L}\p{N}-])`, "iu");
const BUILT_RE = new RegExp(String.raw`^[\s•*·\-–—]*(?:${BUILT_WORDS.map(escape).join("|")})(?![\p{L}\p{N}-])`, "iu");

/** Which rule a single bullet satisfies, highest priority first, or null. */
export function ruleOf(text: string): HighlightRule | null {
  const t = text.trim();
  if (hasNumber(t)) return "number";
  if (OUTCOME_RE.test(t)) return "outcome";
  if (LEAD_RE.test(t)) return "lead";
  if (BUILT_RE.test(t)) return "built";
  return null;
}

/**
 * The card's one highlight: scan all bullets for `number`; if none, `outcome`; then `lead`; then `built`. The chip goes on the
 * FIRST bullet matching the winning rule. A card with no bullets (or nothing matching) gets nothing.
 */
export function highlightFor(bullets: string[]): Highlight | null {
  const rules: HighlightRule[] = bullets.map(ruleOf).filter((r): r is HighlightRule => r !== null);
  for (const rule of ["number", "outcome", "lead", "built"] as const) {
    if (!rules.includes(rule)) continue;
    // `ruleOf` returns each bullet's HIGHEST rule, so "first bullet matching the winning rule" is a lookup on the bullet's own rules.
    const index = bullets.findIndex((b) => matches(b, rule));
    if (index >= 0) return { index, rule, label: `highlight.${rule}` };
  }
  return null;
}

/** Does this bullet satisfy `rule` (not only as its highest rule)? */
function matches(text: string, rule: HighlightRule): boolean {
  const t = text.trim();
  switch (rule) {
    case "number":
      return hasNumber(t);
    case "outcome":
      return OUTCOME_RE.test(t);
    case "lead":
      return LEAD_RE.test(t);
    case "built":
      return BUILT_RE.test(t);
  }
}

/**
 * The tip under a card's bullets: experience and project cards with at least one bullet and NO number in any of them (an
 * education card never gets it, and a card with no bullets is not nagged). It may sit beside a chip of another rule.
 */
export function needsNumberTip(section: Candidate["section"], bullets: string[]): boolean {
  return (section === "EXPERIENCE" || section === "PROJECT") && bullets.length > 0 && !bullets.some(hasNumber);
}
