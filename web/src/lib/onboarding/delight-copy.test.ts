import { afterEach, describe, expect, it, vi } from "vitest";
import { DELIGHT_COPY, LONG_COPY_KEYS, hasPhoneVariant, resolveCopy, stripEmoji, warnUnknownOverrides } from "./delight-copy";

afterEach(() => vi.restoreAllMocks());

/** Every key the design's copy table (DELIGHT 7) names, minus the `.phone` twins (checked separately). */
const SECTION_7_KEYS = [
  "hello.idle", "hello.student", "hello.first_job", "hello.switching", "hello.experienced",
  "source.idle", "source.student", "source.dragover", "source.reading", "source.reading.long", "source.reading.longer", "source.error",
  "paste.idle", "paste.ready", "fresh.idle",
  "interstitial.review", "interstitial.review.one", "interstitial.prefs", "interstitial.go", "interstitial.auto",
  "review.idle", "review.idle.student", "review.idle.first_job", "review.idle.switching", "review.idle.experienced",
  "review.keep", "review.skip", "review.edited", "review.undo", "review.combo", "combo.chip", "review.last",
  "recap.idle", "skills.idle", "skills.five", "you.idle", "you.saving", "you.saved", "sofar.idle",
  "prefs.first", "prefs.idle", "prefs.three", "prefs.eeo", "done.idle", "resume.back", "resume.other",
  "milestone.25", "milestone.50", "milestone.75",
  "highlight.number", "highlight.outcome", "highlight.lead", "highlight.built", "highlight.tip",
  "keys.legend", "share.title", "share.line", "share.meta", "share.site", "share.text", "share.button.share", "share.button.copy", "share.copied",
];

describe("the delight copy deck", () => {
  it("every §7 key has a default", () => {
    for (const k of SECTION_7_KEYS) expect(DELIGHT_COPY[k], k).toBeTruthy();
  });

  it("bubble lines keep the design's rules: 48 characters or fewer, one emoji at most and only at the end, no exclamation stacks", () => {
    for (const [key, value] of Object.entries(DELIGHT_COPY)) {
      if (LONG_COPY_KEYS.has(key)) continue;
      for (const line of Array.isArray(value) ? value : [value]) {
        expect(line.length, `${key}: "${line}"`).toBeLessThanOrEqual(48);
        expect(line, key).not.toMatch(/!!/);
        const emoji = line.match(/\p{Extended_Pictographic}/gu) ?? [];
        expect(emoji.length, key).toBeLessThanOrEqual(1);
        // the one emoji is at the end ("…👋"), never the start or the middle - except the combo chip, whose flame leads the count
        if (emoji.length === 1 && !key.startsWith("combo.chip")) expect(line.replace(/️$/, "").endsWith(emoji[0]), `${key} ends with its emoji`).toBe(true);
      }
    }
  });

  it("no line judges, hurries or shames", () => {
    const all = Object.values(DELIGHT_COPY).flat().join(" ").toLowerCase();
    for (const word of ["required", "hurry", "don't miss", "last chance", "great job", "weak", "lost your"]) expect(all).not.toContain(word);
  });

  it("an override wins over the default", () => {
    expect(resolveCopy("hello.idle", { overrides: { "hello.idle": "Yo" } })).toBe("Yo");
    expect(resolveCopy("hello.idle")).toBe("Hey there 👋");
  });

  it("{vars} are substituted, and a missing one is empty", () => {
    expect(resolveCopy("combo.chip", { vars: { n: 4 } })).toBe("🔥 4 in a row");
    expect(resolveCopy("done.idle", { vars: { firstName: "Priya" } })).toBe("We did it, Priya.");
    expect(resolveCopy("share.line", { vars: {} })).toBe("~ fields autofill-ready");
  });

  it("a list rotates by seed, deterministically (no Math.random), also for a negative or large seed", () => {
    const rand = vi.spyOn(Math, "random");
    const keep = DELIGHT_COPY["review.keep"] as string[];
    for (let seed = 0; seed < 12; seed++) expect(resolveCopy("review.keep", { seed })).toBe(keep[seed % keep.length]);
    expect(resolveCopy("review.keep", { seed: -1 })).toBe(keep[keep.length - 1]);
    expect(resolveCopy("review.keep", { seed: 1000 })).toBe(keep[1000 % keep.length]);
    expect(resolveCopy("review.keep", { seed: 3 })).toBe(resolveCopy("review.keep", { seed: 3 }));
    expect(rand).not.toHaveBeenCalled();
  });

  it("an override list rotates too, and a blank override falls back to the default", () => {
    expect(resolveCopy("review.keep", { overrides: { "review.keep": ["A", "B"] }, seed: 3 })).toBe("B");
    expect(resolveCopy("review.edited", { overrides: { "review.edited": ["  ", ""] } })).toBe("Fixed and kept.");
  });

  it("the phone variant is picked when there is one", () => {
    expect(resolveCopy("review.skip", { phone: true, seed: 1 })).toBe("Easy to add later.");
    expect(resolveCopy("review.skip", { phone: false, seed: 1 })).toBe("Skipped — easy to add later.");
    expect(resolveCopy("combo.chip", { phone: true, vars: { n: 3 } })).toBe("🔥 3");
    expect(resolveCopy("review.edited", { phone: true })).toBe("Fixed and kept."); // no twin: the line itself
    expect(hasPhoneVariant("review.skip")).toBe(true);
    expect(hasPhoneVariant("review.edited")).toBe(false);
  });

  it("an admin who overrides only the base key keeps their words on a phone; an override of the twin wins there", () => {
    expect(resolveCopy("review.skip", { phone: true, seed: 0, overrides: { "review.skip": "Fine." } })).toBe("Fine.");
    expect(resolveCopy("review.skip", { phone: true, seed: 0, overrides: { "review.skip": "Fine.", "review.skip.phone": "OK." } })).toBe("OK.");
  });

  it("an unknown key resolves to an empty string, and unknown override keys are ignored and named once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(resolveCopy("nope.nothing")).toBe("");
    expect(warnUnknownOverrides({ "typo.key": "x", "hello.idle": "Hi" })).toEqual(["typo.key"]);
    warnUnknownOverrides({ "typo.key": "x" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("typo.key");
  });

  it("stripEmoji removes the pictograph for the one line that is read aloud", () => {
    expect(stripEmoji("Halfway — you're fast ⚡")).toBe("Halfway — you're fast");
    expect(stripEmoji("Quarter there 🌱")).toBe("Quarter there");
  });
});
