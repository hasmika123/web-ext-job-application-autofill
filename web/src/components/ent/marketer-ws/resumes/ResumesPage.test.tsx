// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/resumes" }));

import { ToastProvider } from "@kiwiply/ui";
import ResumesPage from "./ResumesPage";

const NOW = Date.now();
const DAY = 864e5;
const iso = (ms: number) => new Date(NOW - ms).toISOString();
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });

type R = [string, string, string, number, boolean, number, string, number];
const BOARD: R[] = [
  ["Alex Morgan", "Java Developer", "Alex Morgan - Consulting Resume", 3, true, 92, "APPROVED", 2],
  ["Priya Sharma", "Business Analyst", "Priya Sharma - BA Resume", 2, true, 88, "APPROVED", 4],
  ["Michael Park", "AWS Engineer", "Michael Park - AWS Resume", 4, false, 85, "PENDING", 7],
  ["Emily Lawson", "Project Manager", "Emily Lawson - PM Resume", 1, true, 76, "APPROVED", 9],
  ["David Kim", "Data Analyst", "David Kim - Data Analyst Resume", 3, false, 82, "NEEDS_UPDATE", 14],
  ["Sophia Patel", "DevOps Engineer", "Sophia Patel - DevOps Resume", 2, true, 90, "APPROVED", 15],
  ["James Wilson", "Full Stack Developer", "James Wilson - Full Stack Resume", 1, false, 68, "NEEDS_UPDATE", 21],
  ["Olivia Martinez", "UI/UX Designer", "Olivia Martinez - UX Resume", 2, true, 80, "PENDING", 22],
  ["Daniel Lee", "Data Scientist", "Daniel Lee - Data Scientist Resume", 3, false, 87, "APPROVED", 28],
  ["Natalie Brown", "QA Engineer", "Natalie Brown - QA Resume", 1, true, 79, "NEEDS_UPDATE", 29],
];
const rows = (canEdit = true) =>
  BOARD.map((b, i) => ({
    id: i + 1, consultantId: i + 1, consultantName: b[0], consultantTitle: b[1], avatarUrl: null, title: b[2], targetRole: b[1], version: b[3], lastModifiedAt: iso(b[7] * DAY),
    primary: b[4], completeness: b[5], approval: b[6], hasFile: false, canEdit,
  }));

const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("total", 48, 12), kpi("profilesReady", 36, 9), kpi("needUpdates", 8, -27), kpi("approvalsPending", 4, 33)],
  items: rows(), total: 48, page: 0, size: 10, skills: ["Java", "SQL"],
  activity: [
    { id: 1, resumeId: 1, consultantId: 1, consultantName: "Alex Morgan", avatarUrl: null, kind: "UPDATED", text: "updated resume to v3", at: iso(2 * 3600e3) },
    { id: 2, resumeId: 4, consultantId: 4, consultantName: "Emily Lawson", avatarUrl: null, kind: "APPROVAL_REQUESTED", text: "resume sent for approval", at: iso(4 * 3600e3) },
    { id: 3, resumeId: 5, consultantId: 5, consultantName: "David Kim", avatarUrl: null, kind: "MARKED_FOR_UPDATE", text: "resume marked for update", at: iso(6 * 3600e3) },
  ],
  canApprove: false,
  ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  row: rows()[0], headline: "Senior Java engineer", summary: "Ships reliable services.", fileName: null,
  skills: [{ name: "Java", primary: true }, { name: "Spring", primary: false }],
  experience: [{ title: "Senior Consultant", employer: "Northwind", startYear: 2021, endYear: null }], history: [], ...over,
});

const HREFS = { talent: "/w/marketing/talent", activity: "/w/marketing/activity" };
const mount = () => render(<ToastProvider><ResumesPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} /></ToastProvider>);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls: { url: string; method: string; body?: string }[] = [];
function stub(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (u: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(u), method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : undefined });
    return handler(String(u), init);
  }));
}
const listCalls = () => calls.filter((c) => /\/mkt\/resumes\?/.test(c.url));

beforeEach(() => stub((url) => (/\/mkt\/resumes\/\d+$/.test(url) ? json(200, detail()) : json(200, fixture()))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResumesPage (board)", () => {
  it("has no tiles: one chip row carries the counts (All, Pending review)", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "All (48)" })).toBeTruthy();
    const pending = screen.getByRole("button", { name: "Pending review (4)" });
    fireEvent.click(pending);
    await waitFor(() => expect(listCalls().some((c) => c.url.includes("status=PENDING"))).toBe(true));
    expect(screen.getByRole("button", { name: "Pending review (4)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers 'New resume for...' (the act-for entry point /w/marketing/resumes lost when h-assign mounted this page)", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    expect(document.querySelector("[data-new-resume-for]")).toBeTruthy();
    expect(screen.getByRole("button", { name: /New resume for/ })).toBeTruthy();
  });

  it("draws the filter row, the column headers and every board row", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    expect(screen.getByPlaceholderText("Search consultants or resume titles...")).toBeTruthy();
    for (const l of ["Filters:", "Skill", "Status", "Date updated", "Availability", "Reset"]) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    const head = screen.getAllByRole("columnheader").map((h) => h.textContent?.replace(/[↑↓]/g, "").trim());
    expect(head).toEqual(["", "Consultant", "Resume title", "Version", "Last modified", "Primary", "Approval status", "Actions"]);
    expect(document.querySelectorAll("[data-resume-row]")).toHaveLength(10);
    const first = document.querySelector('[data-resume-row="1"]') as HTMLElement;
    for (const t of ["Alex Morgan", "Java Developer", "Alex Morgan - Consulting Resume", "v3", "Yes", "Approved", "2 days ago", "View", "Edit", "Download"]) expect(within(first).getAllByText(t).length).toBeGreaterThan(0);
    const third = document.querySelector('[data-resume-row="3"]') as HTMLElement;
    expect(within(third).getByText("No")).toBeTruthy();
    expect(within(third).getByText("Pending review", { selector: "span" })).toBeTruthy();
    expect(within(document.querySelector('[data-resume-row="5"]') as HTMLElement).getByText("Needs update")).toBeTruthy();
    expect(within(document.querySelector('[data-resume-row="5"]') as HTMLElement).getByText("2 weeks ago")).toBeTruthy();
  });

  it("shows the range, the page buttons and the page size", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    expect(screen.getByText("Showing 1–10 of 48 resumes")).toBeTruthy();
    for (const p of [1, 2, 3, 4, 5]) expect(screen.getByRole("button", { name: `Page ${p}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("10 per page")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("has no bee help card and no Recent resume activity card (that lives on Activity)", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    expect(screen.queryByRole("button", { name: /Ask a question/ })).toBeNull();
    expect(screen.queryByText("Recent Resume Activity")).toBeNull();
    expect(screen.queryByText("Recent resume activity")).toBeNull();
    expect(document.querySelector("[data-activity-row]")).toBeNull();
  });

  it("Download is disabled with 'No file stored' because resumes carry no file", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    const dl = screen.getByRole("button", { name: /Download Alex Morgan - Consulting Resume/ }) as HTMLButtonElement;
    expect(dl.disabled).toBe(true);
    expect(dl.parentElement?.getAttribute("title")).toBe("No file stored");
    fireEvent.click(dl);
    expect(calls.some((c) => /download/.test(c.url))).toBe(false);
  });

  it("asks the API again, from page one, when the search rests", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    fireEvent.change(screen.getByPlaceholderText("Search consultants or resume titles..."), { target: { value: "priya" } });
    await waitFor(() => expect(listCalls().some((c) => c.url.includes("q=priya") && c.url.includes("page=0"))).toBe(true));
  });

  it("goes to the next page, and Reset goes back to the defaults", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(listCalls().some((c) => c.url.includes("page=1"))).toBe(true));
    fireEvent.change(screen.getByPlaceholderText("Search consultants or resume titles..."), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => {
      const last = listCalls().at(-1)!.url;
      expect(last).toContain("updated=3m");
      expect(last).toContain("page=0");
      expect(last).not.toContain("q=");
    });
    expect((screen.getByPlaceholderText("Search consultants or resume titles...") as HTMLInputElement).value).toBe("");
  });

  it("sorts by Last modified when its header is pressed", async () => {
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    fireEvent.click(screen.getByRole("button", { name: /Last modified/ }));
    await waitFor(() => expect(listCalls().some((c) => c.url.includes("sort=modified%2Casc"))).toBe(true));
  });

  it("says so, with no rows, when nothing is shared yet; and when the filters match nothing", async () => {
    stub(() => json(200, fixture({ items: [], total: 0, activity: [], kpis: [kpi("total", 0, null), kpi("profilesReady", 0, null), kpi("needUpdates", 0, null), kpi("approvalsPending", 0, null)] })));
    mount();
    await screen.findByText("Ask your consultants to share a resume.");
    expect(screen.getByText("Showing 0 of 0 resumes")).toBeTruthy();
    cleanup();
    stub(() => json(200, fixture({ items: [], total: 0 })));
    mount();
    await screen.findByText("No resumes match these filters.");
  });

  it("offers a retry when the list fails, then recovers", async () => {
    let n = 0;
    stub(() => (++n === 1 ? json(500, {}) : json(200, fixture())));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /try again|retry/i }));
    await screen.findByText("Alex Morgan - Consulting Resume");
  });

  it.each([403, 404])("a %i says the page isn't part of the role", async (status) => {
    stub(() => json(status, { status }));
    mount();
    await screen.findByText("This page isn't part of your role");
    expect(document.querySelector("[data-resume-row]")).toBeNull();
  });

  it("disables Edit for a resume the caller cannot edit", async () => {
    stub(() => json(200, fixture({ items: rows(false) })));
    mount();
    await screen.findByText("Alex Morgan - Consulting Resume");
    expect((screen.getByRole("button", { name: "Edit Alex Morgan - Consulting Resume" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ResumesPage (preview, edit, approval request)", () => {
  it("View opens the read-only preview built from the saved details", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View Alex Morgan - Consulting Resume" }));
    const preview = await screen.findByRole("article", { name: "Resume preview" });
    expect(within(preview).getByText("Senior Java engineer")).toBeTruthy();
    expect(within(preview).getByText("Ships reliable services.")).toBeTruthy();
    expect(within(preview).getByText("Spring")).toBeTruthy();
    expect(within(preview).getByText(/Senior Consultant/)).toBeTruthy();
    expect(within(preview).getByText(/No file stored/)).toBeTruthy();
    expect(calls.some((c) => c.url === "/api/orgs/2/mkt/resumes/1" && c.method === "GET")).toBe(true);
  });

  it("Edit saves through PATCH only the fields that changed (a new version), never anything else", async () => {
    stub((url, init) => {
      if (init.method === "PATCH") return json(200, detail({ headline: "Staff Java engineer", row: { ...rows()[0], version: 4, approval: "PENDING" } }));
      return /\/mkt\/resumes\/\d+$/.test(url) ? json(200, detail()) : json(200, fixture());
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Alex Morgan - Consulting Resume" }));
    const headline = await screen.findByLabelText("Headline");
    const save = screen.getByRole("button", { name: "Save as new version" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(headline, { target: { value: "Staff Java engineer" } });
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/orgs/2/mkt/resumes/1");
    expect(JSON.parse(patch.body!)).toEqual({ headline: "Staff Java engineer" });
    await screen.findByText(/waiting for approval/);
    expect(calls.filter((c) => c.method !== "GET" && c.method !== "PATCH")).toHaveLength(0);
  });

  it("shows the API's validation message and keeps the form", async () => {
    stub((url, init) => (init.method === "PATCH" ? json(422, { error: "summary: contains characters that are not allowed" }) : /\/mkt\/resumes\/\d+$/.test(url) ? json(200, detail()) : json(200, fixture())));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Alex Morgan - Consulting Resume" }));
    fireEvent.change(await screen.findByLabelText("Summary"), { target: { value: "oops" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as new version" }));
    await screen.findByText("summary: contains characters that are not allowed");
    expect(screen.getByLabelText("Summary")).toBeTruthy();
  });

  it("Request approval only asks (POST approval-request); there is no approve button for a marketer", async () => {
    stub((url, init) => (init.method === "POST" ? json(200, detail({ row: { ...rows()[0], approval: "PENDING" } })) : /\/mkt\/resumes\/\d+$/.test(url) ? json(200, detail()) : json(200, fixture())));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View Alex Morgan - Consulting Resume" }));
    await screen.findByRole("article", { name: "Resume preview" });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Request approval" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.url).toBe("/api/orgs/2/mkt/resumes/1/approval-request");
    await screen.findByText(/Approval requested/);
  });

  it("the org admin (canApprove) sees Approve on a pending resume, which POSTs approve", async () => {
    const pending = { ...rows()[2] };
    stub((url, init) => {
      if (init.method === "POST") return json(200, detail({ row: { ...pending, approval: "APPROVED" } }));
      return /\/mkt\/resumes\/\d+$/.test(url) ? json(200, detail({ row: pending })) : json(200, fixture({ canApprove: true }));
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View Michael Park - AWS Resume" }));
    await screen.findByRole("article", { name: "Resume preview" });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.url).toBe("/api/orgs/2/mkt/resumes/3/approve"));
  });
});
