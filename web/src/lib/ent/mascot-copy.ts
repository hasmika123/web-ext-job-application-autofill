import { POSE_KEYS } from "@kiwiply/ui";
import type { EnterprisePose } from "@kiwiply/ui";

/**
 * The enterprise bee's lines (X2.8; doc 11 section 6): a small deck per pose, picked with a SEED so a page does not shuffle
 * on every render (the dashboard greeting seeds with `userId + day`, so it is stable all day and varies across days).
 *
 *  - 3-5 lines per pose, short, warm, never a name or any personal data (the copy is PII-free by construction: the only
 *    variables are the org's TERMINOLOGY labels, `{consultant}`, `{consultants}`, `{marketer}`, `{client}`, `{placement}`).
 *  - Terminology-aware: an org that calls consultants "Talent" gets "Talent" (doc 11 s1.3); a missing key falls back to the
 *    Kiwiply default. Plural keys are explicit (no auto-pluralising), as the terminology contract says.
 *  - Organizations cannot change the character, only the words these tokens expand to.
 */
export type CopyTerms = Partial<Record<"consultant" | "consultants" | "marketer" | "marketers" | "client" | "clients" | "placement" | "placements", string>>;

const DEFAULT_TERMS: Required<CopyTerms> = {
  consultant: "consultant",
  consultants: "consultants",
  marketer: "marketer",
  marketers: "marketers",
  client: "client",
  clients: "clients",
  placement: "placement",
  placements: "placements",
};

const DECK: Record<EnterprisePose, string[]> = {
  welcome: ["Welcome back. Let's get going.", "Good to see you. Sign in and we'll pick up where you left off.", "Hello again. Your workspace is ready."],
  greet: ["Here's what needs you today.", "Morning. A few things are waiting, nothing scary.", "Good to see you. Start with what's at the top.", "Quick look at today, then you're off."],
  empty: ["Nothing here yet. That's a clean slate.", "All quiet. Add the first one when you're ready.", "No {consultants} here yet. Let's change that.", "Empty for now. It fills up fast."],
  encourage: ["Small steps count. Next one is easy.", "You're close. One more thing and this is ready.", "Nice progress. Keep going.", "A little more here and it all clicks."],
  celebrate: ["A {placement}. That's a win for everyone.", "Well done. That one took teamwork.", "Another {placement} on the board.", "Go {consultant}! Go team!", "That's worth a cheer."],
  warn: ["Heads up, this needs a look.", "Something changed here. Worth a minute.", "This one is paused. Check before you go on."],
  error: ["That didn't work, and it's not you. Try again.", "Something went wrong on our side. One more try?", "Oops. Your work is safe. Give it another go."],
  peek: ["Need a hand? I'm right here.", "Just peeking in. Ask if you need anything.", "Looks like you're not part of this one yet."],
  thinking: ["Looking for a good match.", "One moment, working it out.", "Matching {consultants} to the right roles."],
  searching: ["Looking everywhere. Try a different word?", "No matches yet. Widen the search a little.", "Still searching. Fewer filters might help."],
  secure: ["Your data stays private and protected.", "Sensitive details never leave your account.", "Security first. Always."],
  success: ["Saved. All done.", "Done and dusted.", "That's saved. Nicely done."],
  sad: ["Sorry to see them go.", "That's the end of this one. Thank you for everything.", "It's goodbye for now."],
  goodbye: ["See you soon. You're signed out.", "Signed out. Take care.", "Bye for now. Your workspace is safe."],
  onboarding: ["Let's get your team set up.", "Invite your first {consultant} to get started.", "Welcome aboard. A few quick steps and you're in."],
  collaboration: ["Better together. Add your {marketers} and {consultants}.", "Teamwork makes this fly.", "Everyone in one place."],
  resume: ["Let's polish this resume.", "A sharper resume opens more doors.", "Let's make this one shine."],
};

/** A small stable string hash (FNV-1a, 32-bit). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function expand(line: string, terms: CopyTerms): string {
  return line.replace(/\{([a-z]+)\}/g, (_m, key: string) => terms[key as keyof CopyTerms] ?? DEFAULT_TERMS[key as keyof CopyTerms] ?? key);
}

/** How many lines a pose has (for tests and the UI). */
export function linesFor(pose: EnterprisePose): readonly string[] {
  return DECK[pose];
}

/** The bee's line for `pose`: seeded pick (same seed, same line), terminology expanded. */
export function mascotLine(pose: EnterprisePose, opts: { seed?: string; terms?: CopyTerms } = {}): string {
  const deck = DECK[pose];
  const index = hashSeed(`${pose}:${opts.seed ?? ""}`) % deck.length;
  return expand(deck[index], opts.terms ?? {});
}

/** Every pose key has a deck (a test pins that against `@kiwiply/ui`'s map). */
export const DECK_POSES = POSE_KEYS;
