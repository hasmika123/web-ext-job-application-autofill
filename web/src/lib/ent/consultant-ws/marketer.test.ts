import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAN_STATUS, dateBlock, fetchMarketer, focusStage, followupStatus, followupType, nextStepText, parseMarketer, planLine, relativeTime } from "./marketer";

const body = () => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  marketer: { memberId: 5, name: "Emily Carter", title: "Talent Marketing Specialist", assignedAt: "2026-09-01T00:00:00Z" },
  responseBadge: { sample: true, label: "Responsive", detail: "Typically replies within 2 hours" },
  focusOpportunities: [
    { matchId: 1, requirementId: 2, title: "Java Dev", company: "TechCorp", location: null, workMode: "REMOTE", stage: "MARKETING", priority: "HIGH", nextStep: "Share with client", nextStepDue: "2026-10-15" },
    { matchId: null, requirementId: 3, title: "SRE", company: null, location: "Austin", workMode: null, stage: "SUBMITTED", priority: "WEIRD", nextStep: null, nextStepDue: null },
    { bad: true },
  ],
  followups: [
    { key: "app-1", kind: "APPLICATION", dueOn: "2026-10-15", description: "Client feedback", status: "UPCOMING", relatedTitle: "Java Dev", relatedCompany: "TechCorp" },
    { key: "task-2", kind: "TASK", dueOn: "2026-10-16", description: "Update resume", status: "IN_PROGRESS", relatedTitle: null, relatedCompany: null },
    { key: "x" },
  ],
  marketerFocus: [{ key: "marketing", title: "Actively marketing your profile", detail: "to 4 potential opportunities" }, { nope: 1 }],
  messages: { sample: true, items: [{ from: "Emily Carter", mine: false, preview: "Hi!", at: "2026-10-13T18:00:00Z", unread: true }, { from: 1 }] },
  actionPlan: { sample: true, items: [{ title: "Keep profile up to date", status: "DONE", dueOn: null, completedOn: "2026-10-01" }] },
  notes: { sample: true, items: [{ title: "Profile Positioning", on: "2026-10-10", body: "Aligned." }] },
});

describe("parseMarketer", () => {
  it("reads the contract and drops rows that are not the contract", () => {
    const v = parseMarketer(body());
    expect(v?.marketer?.name).toBe("Emily Carter");
    expect(v?.marketer?.title).toBe("Talent Marketing Specialist");
    expect(v?.focusOpportunities).toHaveLength(2);
    expect(v?.focusOpportunities[1].priority).toBe("MEDIUM");
    expect(v?.focusOpportunities[1].matchId).toBeNull();
    expect(v?.followups.map((f) => f.kind)).toEqual(["APPLICATION", "TASK"]);
    expect(v?.marketerFocus).toHaveLength(1);
    expect(v?.messages.items).toHaveLength(1);
    expect(v?.messages.sample).toBe(true);
    expect(v?.actionPlan.sample).toBe(true);
    expect(v?.notes.items[0].title).toBe("Profile Positioning");
  });

  it("keeps a missing marketer as null and every list empty, never invented", () => {
    const v = parseMarketer({ orgId: 2, marketer: null });
    expect(v?.marketer).toBeNull();
    expect(v?.focusOpportunities).toEqual([]);
    expect(v?.followups).toEqual([]);
    expect(v?.marketerFocus).toEqual([]);
    expect(v?.messages.items).toEqual([]);
    expect(v?.messages.sample).toBe(false);
  });

  it("rejects bodies that are not the contract", () => {
    expect(parseMarketer(null)).toBeNull();
    expect(parseMarketer([])).toBeNull();
    expect(parseMarketer({ orgId: "2" })).toBeNull();
  });
});

describe("labels and helpers", () => {
  it("maps stages, statuses and types", () => {
    expect(focusStage("MARKETING")).toEqual({ label: "Marketing", tone: "blue" });
    expect(focusStage("UNDER_REVIEW").label).toBe("In Review");
    expect(focusStage("SOMETHING_NEW").label).toBe("Something new");
    expect(followupStatus("OVERDUE").tone).toBe("red");
    expect(followupStatus("IN_PROGRESS").label).toBe("In Progress");
    expect(followupStatus("?").label).toBe("Not Started");
    expect(followupType("TASK")).toBe("Task");
    expect(followupType("APPLICATION")).toBe("Follow-up");
  });

  it("draws the date block in UTC", () => {
    expect(dateBlock("2026-10-15")).toEqual({ month: "OCT", day: "15" });
    expect(dateBlock("nope")).toEqual({ month: "", day: "" });
  });

  it("formats the next step and the plan lines", () => {
    expect(nextStepText({ nextStep: "Share", nextStepDue: "2026-10-15" })).toEqual({ line1: "Share", line2: "Oct 15, 2026" });
    expect(nextStepText({ nextStep: null, nextStepDue: null })).toEqual({ line1: "", line2: "" });
    expect(planLine({ title: "t", status: "DONE", dueOn: null, completedOn: "2026-10-01" })).toBe("Completed Oct 1, 2026");
    expect(planLine({ title: "t", status: "ON_TRACK", dueOn: "2026-10-31", completedOn: null })).toBe("On track · Due Oct 31, 2026");
    expect(PLAN_STATUS.NOT_STARTED.tone).toBe("slate");
  });

  it("says how long ago a message was", () => {
    const now = Date.parse("2026-10-13T20:00:00Z");
    expect(relativeTime("2026-10-13T19:59:50Z", now)).toBe("Just now");
    expect(relativeTime("2026-10-13T19:30:00Z", now)).toBe("30 minutes ago");
    expect(relativeTime("2026-10-13T18:00:00Z", now)).toBe("2 hours ago");
    expect(relativeTime("2026-10-12T20:00:00Z", now)).toBe("1 day ago");
    expect(relativeTime("2026-10-01T20:00:00Z", now)).toBe("Oct 1, 2026");
    expect(relativeTime("garbage", now)).toBe("");
  });
});

describe("fetchMarketer", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (status: number, json: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(json), { status })));

  it("returns the view, DENIED for 403/404, FAILED otherwise", async () => {
    stub(200, body());
    expect((await fetchMarketer(2)).kind).toBe("OK");
    stub(404, { code: "not_found" });
    expect((await fetchMarketer(2)).kind).toBe("DENIED");
    stub(500, {});
    expect((await fetchMarketer(2)).kind).toBe("FAILED");
    stub(200, { nope: 1 });
    expect((await fetchMarketer(2)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect((await fetchMarketer(2)).kind).toBe("FAILED");
  });
});
