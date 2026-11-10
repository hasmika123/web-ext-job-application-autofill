import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import type { StepKey } from "@/lib/profile-setup/state";
import { barLabel, barValueText, minutesLeftLabel, secondsRemaining } from "./progress";

const SECONDS = DEFAULT_BUILDER_CONFIG.onboarding.stepSeconds; // hello 10, source 40, review 45, skills 20, you 15, prefs 30
const FULL: StepKey[] = ["hello", "source", "review", "skills", "you", "prefs", "done"];
const NO_REVIEW: StepKey[] = ["hello", "source", "skills", "you", "prefs", "done"];

describe("secondsRemaining", () => {
  it("adds up the steps still to do, current one included, never `done`", () => {
    expect(secondsRemaining(FULL, "hello", 0, SECONDS)).toBe(160);
    expect(secondsRemaining(FULL, "skills", 0, SECONDS)).toBe(65);
    expect(secondsRemaining(FULL, "prefs", 0, SECONDS)).toBe(30);
    expect(secondsRemaining(FULL, "done", 0, SECONDS)).toBe(0);
  });

  it("takes off the part of the current step already done", () => {
    expect(secondsRemaining(FULL, "review", 0.5, SECONDS)).toBe(88); // 45 + 20 + 15 + 30, less half of the review's 45 s
    expect(secondsRemaining(FULL, "prefs", 1, SECONDS)).toBe(0);
  });

  it("a run with no review is shorter, and the missing step costs nothing", () => {
    expect(secondsRemaining(NO_REVIEW, "source", 0, SECONDS)).toBe(40 + 20 + 15 + 30);
  });

  it("only ever goes down as the person moves forward", () => {
    let last = Number.POSITIVE_INFINITY;
    for (const step of FULL) {
      for (const sub of [0, 0.25, 0.5, 0.75]) {
        const left = secondsRemaining(FULL, step, sub, SECONDS);
        expect(left).toBeLessThanOrEqual(last);
        last = left;
      }
    }
  });

  it("an unknown step is nothing", () => {
    expect(secondsRemaining(NO_REVIEW, "review", 0, SECONDS)).toBe(0);
  });
});

describe("the bar's words", () => {
  it("'~2 min' on hello and source (the admin's estimate), 'about N min left' after, none on done", () => {
    expect(barLabel("hello", 160, 2)).toBe("~2 min");
    expect(barLabel("source", 150, 2)).toBe("~2 min");
    expect(barLabel("hello", 160, 3)).toBe("~3 min");
    expect(barLabel("review", 110, 2)).toBe("about 2 min left");
    expect(barLabel("skills", 65, 2)).toBe("about 2 min left");
    expect(barLabel("you", 45, 2)).toBe("< 1 min left");
    expect(barLabel("done", 0, 2)).toBeNull();
  });

  it("rounds up to a whole minute, and under a minute is '< 1 min left'", () => {
    expect(minutesLeftLabel(60)).toBe("about 1 min left");
    expect(minutesLeftLabel(61)).toBe("about 2 min left");
    expect(minutesLeftLabel(59)).toBe("< 1 min left");
    expect(minutesLeftLabel(0)).toBe("< 1 min left");
  });

  it("the spoken value is 'Step i of n, about m minutes left'", () => {
    expect(barValueText(3, 7, 70)).toBe("Step 3 of 7, about 2 minutes left");
    expect(barValueText(5, 7, 60)).toBe("Step 5 of 7, about 1 minute left");
    expect(barValueText(6, 7, 20)).toBe("Step 6 of 7, less than a minute left");
    expect(barValueText(9, 7, 20)).toBe("Step 7 of 7, less than a minute left");
  });
});
