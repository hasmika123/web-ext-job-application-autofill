import { describe, expect, it } from "vitest";
import { DEFAULT_QUERY, barWidth, listUrl, nextStep, parseApplications, parseDetail, sourceBadge, stageLabel, updateText } from "./applications";

const tile = { value: 2, previous: 0, deltaPct: null, sparkline: [0, 1, 2] };
const row = { applicationId: 1, code: "APP-1", requirementId: 3, title: "Dev", company: "Acme", appliedOn: "2024-10-14", source: "Job Match", stage: "UNDER_REVIEW", closedReason: null, nextAction: "Call", nextActionDue: "2024-10-18" };

describe("applications lib", () => {
  it("parses the page and drops rows that are not the contract", () => {
    const v = parseApplications({
      orgId: 2,
      name: "A",
      tiles: { total: tile, underReview: tile, interviews: tile, rejected: tile, offers: tile },
      rows: [row, { nope: true }],
      paging: { page: 0, size: 10, total: 1, pages: 1 },
      statuses: [{ key: "ALL", count: 1 }],
      funnel: [{ key: "TOTAL", count: 1, percent: 100 }, { key: "BOGUS", count: 1 }],
      recent: [{ id: 1, applicationId: 1, toStage: "OFFER", at: "2024-10-10T09:24:00Z", by: "XX" }],
    });
    expect(v?.rows).toHaveLength(1);
    expect(v?.funnel).toHaveLength(1);
    expect(v?.tiles.total.deltaPct).toBeNull();
    expect(v?.recent[0].by).toBe("TEAM");
    expect(parseApplications({ orgId: "x" })).toBeNull();
  });

  it("parses the detail", () => {
    const d = parseDetail({ row, createdAt: "2024-10-01T00:00:00Z", timeline: [{ id: 1, type: "CREATED", toStage: "ASSIGNED", by: "YOU", at: "2024-10-01T00:00:00Z" }, { id: 2 }] });
    expect(d?.timeline).toHaveLength(1);
    expect(parseDetail({})).toBeNull();
  });

  it("labels stages without inventing any", () => {
    expect(stageLabel("INTERVIEWING", null).label).toBe("Interview Scheduled");
    expect(stageLabel("CLOSED", "REJECTED")).toEqual({ label: "Rejected", tone: "red" });
    expect(stageLabel("CLOSED", null).label).toBe("Closed");
  });

  it("shows unknown source labels as given", () => {
    expect(sourceBadge("Job Discovery")).toEqual({ label: "Job Discovery", tone: "blue" });
    expect(sourceBadge("Vendor Portal")).toEqual({ label: "Vendor Portal", tone: "slate" });
    expect(sourceBadge(null)).toBeNull();
  });

  it("next step, bars, urls and update text", () => {
    expect(nextStep({ nextAction: null, nextActionDue: null })).toBeNull();
    expect(nextStep(row)?.due).toBe("Oct 18, 2024");
    expect(barWidth(0, 10)).toBe(0);
    expect(barWidth(1, 100)).toBe(6);
    expect(barWidth(10, 10)).toBe(100);
    expect(listUrl(2, DEFAULT_QUERY)).toBe("/api/orgs/2/me-workspace/applications");
    expect(listUrl(2, { status: "OFFER", sort: "company", page: 1, size: 10 })).toBe("/api/orgs/2/me-workspace/applications?status=OFFER&sort=company&page=1");
    expect(updateText({ toStage: "OFFER", closedReason: null, title: "Dev", company: "Acme" }).title).toBe("Offer Received");
    expect(updateText({ toStage: "CLOSED", closedReason: "REJECTED", title: null, company: "Meta" }).tone).toBe("red");
  });
});
