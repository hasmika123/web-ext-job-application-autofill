import { describe, expect, it } from "vitest";
import { PREFERENCE_QUESTIONS } from "@/components/onboarding/preferences";
import { FRESH_GOALS } from "@/lib/profile-options";
import { PERSONAS } from "@/lib/profile-setup/state";
import { PERSONA_CHIPS, freshGoalFor, leadsWithFresh, noticeForMonth, personaLabel, prefOrder, prefRewrite, prefTip, sourceHeader, sourceOrder, type PrefId } from "./persona";

describe("persona chips", () => {
  it("are the four personas in the §5.2 order with the §5.14 labels", () => {
    expect(PERSONA_CHIPS.map((c) => c.id)).toEqual(PERSONAS);
    expect(PERSONA_CHIPS.map((c) => c.label)).toEqual(["Student / Internship", "First job", "Switching careers", "Experienced"]);
    expect(personaLabel("first_job")).toBe("First job");
  });
});

describe("the source screen's order (DESIGN 3.2 / 5.3)", () => {
  it("student and first job lead with Start fresh and the warmer header; the rest lead with Paste", () => {
    for (const p of ["student", "first_job"] as const) {
      expect(leadsWithFresh(p)).toBe(true);
      expect(sourceOrder(p)).toEqual(["fresh", "paste"]);
      expect(sourceHeader(p)).toBe("No resume yet? Totally fine.");
    }
    for (const p of ["switching", "experienced", null] as const) {
      expect(leadsWithFresh(p)).toBe(false);
      expect(sourceOrder(p)).toEqual(["paste", "fresh"]);
      expect(sourceHeader(p)).toBe("No file handy?");
    }
  });

  it("the guided goal chip is pre-filled from the persona, and only the persona's four map to real goals", () => {
    expect(freshGoalFor("student")).toBe("internship");
    expect(freshGoalFor("first_job")).toBe("first-job");
    expect(freshGoalFor("switching")).toBe("switch");
    expect(freshGoalFor("experienced")).toBe("same");
    expect(freshGoalFor(null)).toBe("");
    const ids = FRESH_GOALS.map((g) => g.id) as string[];
    for (const p of PERSONAS) expect(ids).toContain(freshGoalFor(p));
  });
});

describe("the question order (DESIGN 3.2)", () => {
  const ids = (list: PrefId[]) => list;
  it("no persona is the /welcome order", () => {
    expect(ids(prefOrder(null).shown)).toEqual(["authorizedToWork", "requireSponsorship", "desiredSalary", "noticePeriod", "workPreference", "gender"]);
    expect(prefOrder(null).hidden).toEqual([]);
  });

  it("student: work authorization, sponsorship, work arrangement, start date, then EEO; salary is hidden", () => {
    expect(prefOrder("student")).toEqual({ shown: ["authorizedToWork", "requireSponsorship", "workPreference", "noticePeriod", "gender"], hidden: ["desiredSalary"] });
  });

  it("first job: salary is asked, third", () => {
    expect(prefOrder("first_job").shown).toEqual(["authorizedToWork", "requireSponsorship", "desiredSalary", "noticePeriod", "workPreference", "gender"]);
  });

  it("switching puts the work arrangement before salary and notice; experienced puts notice and salary first", () => {
    expect(prefOrder("switching").shown).toEqual(["authorizedToWork", "requireSponsorship", "workPreference", "desiredSalary", "noticePeriod", "gender"]);
    expect(prefOrder("experienced").shown).toEqual(["authorizedToWork", "requireSponsorship", "noticePeriod", "desiredSalary", "workPreference", "gender"]);
  });

  it("every persona covers each of the six questions exactly once (shown or hidden), and EEO is always last", () => {
    const keys = PREFERENCE_QUESTIONS.map((q) => q.keys[0]).sort();
    for (const p of [...PERSONAS, null]) {
      const { shown, hidden } = prefOrder(p);
      expect([...shown, ...hidden].sort()).toEqual(keys);
      expect(shown[shown.length - 1]).toBe("gender");
    }
  });

  it("has a tip per persona and none without one", () => {
    expect(prefTip("student")).toBe("Internship forms ask this on page one.");
    expect(prefTip("first_job")).toBe("Most entry-level forms ask these five.");
    expect(prefTip("experienced")).toBe("Senior roles nearly always ask notice and salary.");
    expect(prefTip(null)).toBeNull();
  });
});

describe("persona rewrites (DESIGN 5.9)", () => {
  it("student and first job ask 'When could you start?' with start chips; the others keep the /welcome wording", () => {
    for (const p of ["student", "first_job"] as const) {
      expect(prefRewrite(p, "noticePeriod")).toMatchObject({ title: "When could you start?", startChips: true });
    }
    expect(prefRewrite("experienced", "noticePeriod")).toEqual({});
    expect(prefRewrite(null, "noticePeriod")).toEqual({});
  });

  it("first job gets the salary hint; EEO always reads 'Optional. Only filled where a form asks…'", () => {
    expect(prefRewrite("first_job", "desiredSalary").hint).toBe("A range is fine, e.g. $45–55k");
    expect(prefRewrite("experienced", "desiredSalary")).toEqual({});
    expect(prefRewrite(null, "gender").why).toBe("Optional. Only filled where a form asks, and you review each one.");
  });
});

describe("the nearest notice option for a start month (DECISIONS #33d)", () => {
  const now = new Date(2026, 9, 12); // October 2026
  it("this month or earlier is Immediately; later months are the nearest NOTICE option", () => {
    expect(noticeForMonth("2026-10", now)).toBe("Immediately");
    expect(noticeForMonth("2026-08", now)).toBe("Immediately");
    expect(noticeForMonth("2026-11", now)).toBe("1 month");
    expect(noticeForMonth("2026-12", now)).toBe("2 months");
    expect(noticeForMonth("2027-01", now)).toBe("3 months");
    expect(noticeForMonth("2027-09", now)).toBe("3 months");
  });
  it("a year alone counts from its January, and nothing is Immediately", () => {
    expect(noticeForMonth("2027", now)).toBe("3 months");
    expect(noticeForMonth("2026", now)).toBe("Immediately");
    expect(noticeForMonth("", now)).toBe("Immediately");
  });
});
