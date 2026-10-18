/**
 * The delight copy deck (R1.14, ONBOARDING-DELIGHT-DESIGN 7): every line the companion's bubble, the milestone pops, the
 * interstitial, the combo chip, the highlight chips and the share card say. Defaults live here; the admin overrides any key
 * by name in `onboarding.delight.copy` (a string, or an array that rotates). Rules the lines keep: at most 48 characters
 * (the bubble is two lines), one emoji at most and only at the end, no exclamation stacks, never a judgement of the person's
 * data, never sarcasm, never "required", never urgency.
 *
 * A key may have a `.phone` twin: the one-line caption under the heading on a phone uses it when it exists. A list rotates by
 * `seed % length`, never by chance, so a test or a screenshot is stable and the same card shows the same line after a Back.
 */

export type CopyValue = string | string[];
export type CopyVars = Record<string, string | number>;

export const DELIGHT_COPY: Record<string, CopyValue> = {
  "hello.idle": "Hey there 👋",
  "hello.student": "Nice — let's keep it simple.",
  "hello.first_job": "First one's the big one. Let's go.",
  "hello.first_job.phone": "Let's go.",
  "hello.switching": "New chapter. Let's get it right.",
  "hello.experienced": "Let's make this quick for you.",

  "source.idle": "Drop it in — I'll do the reading.",
  "source.idle.phone": "I'll do the reading.",
  "source.student": "No resume yet? Start fresh works.",
  "source.dragover": "Yes, right here.",
  "source.reading": "Reading your resume…",
  "source.reading.long": "Almost there…",
  "source.reading.longer": "Still reading — big file.",
  "source.error": "That one's stubborn. Try another?",

  "paste.idle": "Paste it — I'll sort the rest.",
  "paste.ready": "That'll do. Hit Read it.",

  "fresh.idle": "No resume needed. Just answer.",

  "interstitial.review": "{counts} — let's check them 👀",
  "interstitial.review.one": "{counts} — let's take a look 👀",
  "interstitial.prefs": "Last stretch — {k} quick questions. All skippable.",
  "interstitial.prefs.phone": "{k} quick questions, all skippable.",
  "interstitial.go": "Let's go",
  "interstitial.auto": "(auto in a moment)",

  "review.idle": ["Swipe or tap — your call.", "Taking it card by card.", "Only what you confirm goes in.", "Edit if something's off."],
  "review.idle.phone": ["Your call.", "Card by card.", "Only what you confirm.", "Edit if it's off."],
  "review.idle.student": "Internships and part-time count too.",
  "review.idle.student.phone": "Part-time counts too.",
  "review.idle.first_job": "Every bit counts here.",
  "review.idle.switching": "Transferable stuff — keep it.",
  "review.idle.experienced": "You've got plenty. Let's move.",
  "review.idle.experienced.phone": "Let's move.",
  "review.keep": ["Nice one.", "That's a keeper.", "Adding that.", "Yep, that's going in.", "Solid."],
  "review.skip": ["No worries.", "Skipped — easy to add later.", "Cool, moving on.", "Your call. Next one."],
  "review.skip.phone": ["No worries.", "Easy to add later.", "Moving on.", "Next one."],
  "review.edited": "Fixed and kept.",
  "review.undo": "Back in the list.",
  "review.combo": "Three in a row 🔥",
  "combo.chip": "🔥 {n} in a row",
  "combo.chip.phone": "🔥 {n}",
  "review.last": "Last one.",

  "recap.idle": "You just saved yourself some typing.",
  "recap.idle.phone": "Saved yourself some typing.",

  "skills.idle": "Tap what's true. Skip what's not.",
  "skills.idle.phone": "Tap what's true.",
  "skills.five": "Five already — forms love that.",
  "skills.five.phone": "Five — forms love that.",

  "you.idle": "Last check. Then it's saved.",
  "you.saving": "Saving…",
  "you.saved": "Saved. That's the big one done.",
  "you.saved.phone": "Saved ✓",

  "sofar.idle": "All safe. Pick up anytime.",

  "prefs.first": "Quick ones. All skippable.",
  "prefs.idle": ["Forms ask this a lot.", "Answer once, filled everywhere.", "Skip is always fine."],
  "prefs.three": "Three down — nearly there.",
  "prefs.eeo": "Optional. Your call entirely.",

  "done.idle": "We did it, {firstName}.",
  "done.idle.noname": "We did it.",

  "resume.back": "Welcome back 👋",
  "resume.other": "Picked up from your other device 👋",
  "resume.other.phone": "Welcome back 👋",

  "milestone.25": "Quarter there 🌱",
  "milestone.50": "Halfway — you're fast ⚡",
  "milestone.75": "Almost done 🎯",

  "highlight.number": "Numbers stand out to recruiters",
  "highlight.outcome": "Shows a result, not just a task",
  "highlight.lead": "Leading something — recruiters notice",
  "highlight.built": "Shipped work — clear and concrete",
  // A tip, not a bubble line: it sits under a card's bullets, so it may run longer than 48 characters.
  "highlight.tip": "Tip: a number here (users, %, $) makes it stronger — easy to add later in your Resume Builder.",

  "keys.legend": "← Skip · → Keep · E Edit · Z Undo",

  "share.title": "Profile ready ✨",
  "share.line": "~{n} fields autofill-ready",
  "share.meta": "{firstName} · {month}",
  "share.meta.noname": "{month}",
  "share.site": "kiwiply.com",
  "share.text": "I just set up my Kiwiply profile — ~{n} fields autofill-ready ✨ kiwiply.com",
  "share.button.share": "Share",
  "share.button.copy": "Copy",
  "share.copied": "Copied",
};

/** Keys that are not bubble / caption lines and so are exempt from the 48 character rule. */
export const LONG_COPY_KEYS: ReadonlySet<string> = new Set(["highlight.tip", "share.text", "interstitial.prefs", "interstitial.review", "interstitial.review.one"]);

const warned = new Set<string>();

/** Override keys that are not in the deck are ignored and named once in the console (so an admin's typo is findable). */
export function warnUnknownOverrides(overrides: Record<string, CopyValue> | undefined): string[] {
  const unknown: string[] = [];
  for (const key of Object.keys(overrides ?? {})) {
    if (key in DELIGHT_COPY) continue;
    unknown.push(key);
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`onboarding.delight.copy: unknown key "${key}" ignored`);
    }
  }
  return unknown;
}

const lines = (v: CopyValue | undefined): string[] | null => {
  if (v === undefined) return null;
  const list = (Array.isArray(v) ? v : [v]).filter((s): s is string => typeof s === "string" && s.trim() !== "");
  return list.length > 0 ? list : null;
};

/** Is there a phone twin (`key.phone`) for this key, in the deck or in the admin's overrides? */
export function hasPhoneVariant(key: string, overrides?: Record<string, CopyValue>): boolean {
  return `${key}.phone` in DELIGHT_COPY || `${key}.phone` in (overrides ?? {});
}

/**
 * The line for `key`: the admin's override first, then the default; `{vars}` are substituted (a missing one becomes empty);
 * a list picks `seed % length`. With `phone`, the `.phone` twin is used when there is one, unless the admin overrode only the
 * base key (their words win over our shorter default). An unknown key resolves to "" so a typo never shows "undefined".
 */
export function resolveCopy(key: string, opts: { vars?: CopyVars; seed?: number; overrides?: Record<string, CopyValue>; phone?: boolean } = {}): string {
  const { vars, seed = 0, overrides, phone = false } = opts;
  const known = (k: string) => (k in DELIGHT_COPY ? k : null);
  let picked: string[] | null = null;
  if (phone) {
    picked = lines(overrides?.[`${key}.phone`]);
    if (!picked && !lines(overrides?.[key]) && known(key) !== null) picked = lines(DELIGHT_COPY[`${key}.phone`]);
  }
  picked ??= lines(overrides?.[key]) ?? lines(DELIGHT_COPY[key]);
  if (!picked) return "";
  const i = ((Math.trunc(seed) % picked.length) + picked.length) % picked.length;
  return picked[i].replace(/\{(\w+)\}/g, (_, name: string) => (vars && name in vars ? String(vars[name]) : ""));
}

/** The line without its emoji (`\p{Extended_Pictographic}`), for the one place a line is read aloud (the milestone announcement). */
export function stripEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/\s+/g, " ").trim();
}
