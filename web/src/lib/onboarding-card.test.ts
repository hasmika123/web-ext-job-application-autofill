import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import {
  CARD_KEY,
  ONBOARDING_DEFAULTS,
  dropLegacyCardMemory,
  isLegacyMemoryActive,
  minutesLeftLabel,
  onboardingSettings,
  readLegacyCardMemory,
  secondsLeft,
} from "./onboarding-card";

beforeEach(() => localStorage.clear());

describe("settings", () => {
  it("come from config.onboarding, and an older API without the group falls back to the declared defaults", () => {
    expect(onboardingSettings({ onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, estimateMinutes: 4, card: { ...DEFAULT_BUILDER_CONFIG.onboarding.card, snoozeDays: 7 } } })).toMatchObject({ estimateMinutes: 4, snoozeDays: 7 });
    expect(onboardingSettings({})).toEqual(ONBOARDING_DEFAULTS);
  });
});

describe("the time left", () => {
  const seconds = { hello: 10, source: 40, review: 45, skills: 20, you: 15, prefs: 30 };

  it("sums the steps from the draft's current one on, so it only ever goes down", () => {
    expect(secondsLeft("hello", seconds)).toBe(160);
    expect(secondsLeft("source", seconds)).toBe(150);
    expect(secondsLeft("review", seconds)).toBe(110);
    expect(secondsLeft("skills", seconds)).toBe(65);
    expect(secondsLeft("you", seconds)).toBe(45);
    expect(secondsLeft("prefs", seconds)).toBe(30);
  });

  it("an unknown step counts from the start; a missing time counts for nothing", () => {
    expect(secondsLeft("mystery", seconds)).toBe(160);
    expect(secondsLeft("you", { you: 15 })).toBe(15);
  });

  it("is worded as whole minutes, rounded up, or under a minute", () => {
    expect(minutesLeftLabel(110)).toBe("about 2 min left");
    expect(minutesLeftLabel(60)).toBe("about 1 min left");
    expect(minutesLeftLabel(59)).toBe("< 1 min left");
    expect(minutesLeftLabel(0)).toBe("< 1 min left");
  });
});

describe("the R1.7 browser memory", () => {
  const put = (all: unknown) => localStorage.setItem(CARD_KEY, typeof all === "string" ? all : JSON.stringify(all));

  it("reads this login's value without removing it", () => {
    put({ jo: { dismissedAt: "2026-10-01T00:00:00Z" }, ann: { snoozedUntil: "2099-01-01T00:00:00Z" } });
    expect(readLegacyCardMemory(localStorage, "jo")).toEqual({ dismissedAt: "2026-10-01T00:00:00Z" });
    expect(readLegacyCardMemory(localStorage, "bob")).toBeNull();
    expect(localStorage.getItem(CARD_KEY)).not.toBeNull();
  });

  it("drops one login's value and the key once nobody's is left", () => {
    put({ jo: { dismissedAt: "x" }, ann: { dismissedAt: "y" } });
    dropLegacyCardMemory(localStorage, "jo");
    expect(JSON.parse(localStorage.getItem(CARD_KEY) ?? "{}")).toEqual({ ann: { dismissedAt: "y" } });
    dropLegacyCardMemory(localStorage, "ann");
    expect(localStorage.getItem(CARD_KEY)).toBeNull();
  });

  it("is quiet about junk, missing storage and broken storage", () => {
    put("{nope");
    expect(readLegacyCardMemory(localStorage, "jo")).toBeNull();
    put(["a"]);
    expect(readLegacyCardMemory(localStorage, "jo")).toBeNull();
    expect(localStorage.getItem(CARD_KEY)).toBeNull(); // an unusable value is cleared
    expect(readLegacyCardMemory(undefined, "jo")).toBeNull();
    expect(() => dropLegacyCardMemory(undefined, "jo")).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(readLegacyCardMemory(broken, "jo")).toBeNull();
    expect(() => dropLegacyCardMemory(broken, "jo")).not.toThrow();
  });

  it("a dismiss is always active; a snooze only until it runs out", () => {
    const now = Date.parse("2026-10-12T10:00:00Z");
    expect(isLegacyMemoryActive({ dismissedAt: "2026-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isLegacyMemoryActive({ snoozedUntil: "2026-10-13T00:00:00Z" }, now)).toBe(true);
    expect(isLegacyMemoryActive({ snoozedUntil: "2026-10-12T09:00:00Z" }, now)).toBe(false);
    expect(isLegacyMemoryActive({ snoozedUntil: "garbage" }, now)).toBe(false);
    expect(isLegacyMemoryActive({}, now)).toBe(false);
  });
});
