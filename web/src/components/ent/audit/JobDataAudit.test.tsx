// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JobDataAudit from "./JobDataAudit";
import { jobDataCsv, jobDataParams, narrow, parseJobData, DEFAULT_JOB_DATA_QUERY } from "@/lib/ent/job-data-audit";

const job = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  title: "Senior Java Developer",
  employer: "Acme",
  captureSource: "ENTERPRISE_EXTENSION",
  captureMethod: "PAGE_CAPTURE",
  capturedAt: "2026-10-14T10:00:00Z",
  capturedBy: { memberId: 7, name: "Omar Marketer" },
  extensionVersion: "1.4.2",
  detailLevel: "MINIMAL",
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  items: [
    { job: job(1), events: [{ id: 10, type: "CAPTURED", occurredAt: "2026-10-14T10:00:00Z", actorKind: "MEMBER", actor: { memberId: 7, name: "Omar Marketer" } }] },
    { job: job(2, { title: "=HYPERLINK(\"http://x\")", employer: "Globex", captureSource: "MANUAL", capturedBy: { memberId: 8, name: "Sarah Staffer" }, extensionVersion: null }), events: [] },
  ],
  total: 30,
  page: 0,
  size: 25,
  ...over,
});

let urls: string[];
let answer: () => { status: number; json: unknown };
beforeEach(() => {
  urls = [];
  answer = () => ({ status: 200, json: body() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const r = answer();
      return { ok: r.status === 200, status: r.status, json: async () => r.json } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});

describe("Captured jobs (MKT-46)", () => {
  it("lists who captured which job, when, from where and with which extension version", async () => {
    render(<JobDataAudit orgId={2} />);
    await settle();
    const rows = Array.from(document.querySelectorAll("[data-job-row]"));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Senior Java Developer");
    expect(rows[0].textContent).toContain("Omar Marketer");
    expect(rows[0].textContent).toContain("Enterprise extension");
    expect(rows[0].textContent).toContain("1.4.2");
    expect(document.querySelector("[data-job-data-range]")!.textContent).toContain("30 jobs");
    expect(urls[0]).toBe("/api/orgs/2/audit/job-data?page=0&size=25");
  });

  it("narrows by text and source over the page, and pages from the API", async () => {
    render(<JobDataAudit orgId={2} />);
    await settle();
    fireEvent.change(screen.getByLabelText("Search captured jobs"), { target: { value: "sarah" } });
    expect(document.querySelectorAll("[data-job-row]")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search captured jobs"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    expect(urls[urls.length - 1]).toBe("/api/orgs/2/audit/job-data?page=1&size=25");
  });

  it("an empty answer and a refusal say so plainly", async () => {
    answer = () => ({ status: 200, json: body({ items: [], total: 0 }) });
    render(<JobDataAudit orgId={2} />);
    await settle();
    expect(screen.getByText("No jobs have been captured yet")).toBeTruthy();
    cleanup();
    answer = () => ({ status: 404, json: {} });
    render(<JobDataAudit orgId={2} />);
    await settle();
    expect(screen.getByText(/isn't part of your role/)).toBeTruthy();
  });
});

describe("job data audit helpers", () => {
  it("parses tolerantly and refuses a body that is not the contract", () => {
    expect(parseJobData({ nope: 1 })).toBeNull();
    const p = parseJobData(body({ items: [{ job: { id: "x" } }, ...body().items] }))!;
    expect(p.items).toHaveLength(2);
    expect(p.items[1].job.extensionVersion).toBeNull();
  });

  it("builds whole-day date params", () => {
    const p = jobDataParams({ ...DEFAULT_JOB_DATA_QUERY, from: "2026-10-01", to: "2026-10-02", page: 2 });
    expect(p.get("page")).toBe("2");
    expect(new Date(p.get("to")!).getTime() - new Date(p.get("from")!).getTime()).toBe(2 * 86_400_000);
  });

  it("the CSV neutralizes a leading formula character in every cell", () => {
    const csv = jobDataCsv(parseJobData(body())!.items);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Job,Employer,Captured by,Captured at,Source,Method,Extension version,Detail level,Events");
    expect(lines[2].startsWith("\"'=HYPERLINK(")).toBe(true);
    expect(csv).not.toMatch(/(^|,)=/m);
    expect(narrow(parseJobData(body())!.items, "", "MANUAL")).toHaveLength(1);
  });
});
