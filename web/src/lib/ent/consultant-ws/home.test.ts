import { describe, expect, it } from "vitest";
import { applicationLabel, deltaText, employmentLabel, initialsOf, interviewWhen, matchTone, parseHome, placeLabel, shortDate, taskStatusLabel } from "./home";

const tile = (value: number, extra: Record<string, unknown> = {}) => ({ value, previous: 1, deltaPct: 10, sparkline: [0, 1, 2], sample: false, ...extra });

const body = () => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  me: { consultantId: 1, name: "Anika Rao", jobTitle: "Full Stack Developer" },
  tiles: {
    jobMatches: tile(9),
    assignedOpportunities: tile(8),
    activeApplications: tile(5),
    upcomingInterviews: tile(3),
    submissionsPending: tile(0, { sample: true, deltaPct: null }),
    activePlacement: { value: 1, label: "On track" },
  },
  recommendedMatches: [{ matchId: 1, requirementId: 2, title: "Java Dev", company: "TechCorp", score: 92, location: null, workMode: "REMOTE", employment: "CONTRACT" }, { bad: true }],
  assignedOpportunities: [{ matchId: 3, requirementId: 4, title: "DevOps", company: "X", status: "REVIEW_NEEDED", assignedAt: "2026-10-11T00:00:00Z" }, { matchId: 4, title: "t", status: "NOPE" }],
  applications: [{ id: 7, code: "APP-1", title: "T", company: "C", stage: "SUBMITTED", closedReason: null, appliedOn: "2026-10-12" }],
  interviews: [{ id: 9, scheduledAt: "2026-10-15T14:00:00Z", durationMinutes: 60, title: "T", company: "C", round: "R", mode: "VIDEO", modeSample: true }],
  resumeStrength: { percent: 140, hasResume: true, checks: [{ key: "a", label: "A", done: true }] },
  todaysFocus: { date: "2026-10-13", items: [{ key: "k", label: "L" }] },
  tasks: [{ id: 1, title: "Do", dueOn: "2026-10-13", priority: "WEIRD", status: "PENDING" }],
  marketerMessages: { sample: true, items: [] },
});

describe("parseHome", () => {
  it("reads the contract and drops rows that are not the contract", () => {
    const v = parseHome(body());
    expect(v?.me.name).toBe("Anika Rao");
    expect(v?.tiles.jobMatches.value).toBe(9);
    expect(v?.tiles.submissionsPending.sample).toBe(true);
    expect(v?.recommendedMatches).toHaveLength(1);
    expect(v?.assignedOpportunities).toHaveLength(1);
    expect(v?.interviews[0].modeSample).toBe(true);
    expect(v?.marketerMessages.sample).toBe(true);
  });

  it("clamps the strength percent and defaults an unknown priority", () => {
    const v = parseHome(body());
    expect(v?.resumeStrength.percent).toBe(100);
    expect(v?.tasks[0].priority).toBe("MEDIUM");
  });

  it("is null when it is not the contract", () => {
    expect(parseHome(null)).toBeNull();
    expect(parseHome({ orgId: "x" })).toBeNull();
    expect(parseHome({ orgId: 1, me: {} })).toBeNull();
  });

  it("never invents a number for a missing tile", () => {
    const b = body() as Record<string, unknown>;
    (b.tiles as Record<string, unknown>).jobMatches = undefined;
    expect(parseHome(b)?.tiles.jobMatches).toEqual({ value: 0, previous: null, deltaPct: null, sparkline: [], sample: false });
  });
});

describe("labels", () => {
  it("maps stages the way a consultant reads them", () => {
    expect(applicationLabel("SUBMITTED", null).label).toBe("Submitted");
    expect(applicationLabel("INTERVIEWING", null).label).toBe("Interview Scheduled");
    expect(applicationLabel("CLOSED", "REJECTED")).toEqual({ label: "Not Selected", tone: "red" });
    expect(applicationLabel("CLOSED", "HIRED").tone).toBe("green");
    expect(applicationLabel("SOMETHING_NEW", null).label).toBe("Something new");
  });

  it("tones the match pill", () => {
    expect(matchTone(92)).toBe("green");
    expect(matchTone(78)).toBe("amber");
  });

  it("formats employment, place and task status", () => {
    expect(employmentLabel("FTE")).toBe("Full-time");
    expect(employmentLabel("CONTRACT")).toBe("Contract");
    expect(employmentLabel(null)).toBeNull();
    expect(placeLabel(null, "REMOTE")).toBe("Remote");
    expect(placeLabel("San Jose, CA", "ONSITE")).toBe("San Jose, CA");
    expect(taskStatusLabel("IN_PROGRESS").label).toBe("In Progress");
    expect(taskStatusLabel("anything").label).toBe("Not Started");
  });

  it("makes initials", () => {
    expect(initialsOf("TechCorp")).toBe("TC");
    expect(initialsOf("Global Media")).toBe("GM");
    expect(initialsOf("Acme")).toBe("AC");
    expect(initialsOf(null)).toBe("?");
  });
});

describe("numbers and dates", () => {
  it("draws a delta only when the API gave one", () => {
    expect(deltaText(null)).toBeNull();
    expect(deltaText(0)).toEqual({ dir: "flat", text: "0%" });
    expect(deltaText(18)).toEqual({ dir: "up", text: "18%" });
    expect(deltaText(-20)).toEqual({ dir: "down", text: "20%" });
    expect(deltaText(4.26)).toEqual({ dir: "up", text: "4.3%" });
  });

  it("formats a date in UTC", () => {
    expect(shortDate("2026-10-12")).toBe("Oct 12, 2026");
    expect(shortDate("2026-10-11T23:30:00Z")).toBe("Oct 11, 2026");
    expect(shortDate(null)).toBe("");
    expect(shortDate("nope")).toBe("");
  });

  it("describes an interview slot", () => {
    const w = interviewWhen("2026-10-15T14:00:00Z", 60);
    expect(w.month).toBe("OCT");
    expect(w.line2).toMatch(/–/);
    expect(interviewWhen("bad", 30).day).toBe("");
  });
});
