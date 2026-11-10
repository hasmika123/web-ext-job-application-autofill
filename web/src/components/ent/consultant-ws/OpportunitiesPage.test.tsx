// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/opportunities", useSearchParams: () => new URLSearchParams("") }));

import { ToastProvider } from "@kiwiply/ui";
import OpportunitiesPage from "./OpportunitiesPage";

const tile = (value: number, deltaPct: number | null = null) => ({ value, previous: 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value] });
const orow = (over: Record<string, unknown>) => ({
  matchId: 1, requirementId: 10, title: "Senior Java Developer", skills: ["Java", "Spring Boot"], company: "TechCorp", location: "San Jose, CA", workMode: "ONSITE", marketer: "Michael Torres",
  status: "NEW", priority: "HIGH", priorityDerived: false, dueOn: "2026-10-16", dueDerived: false, daysLeft: 2, score: 94, missingSkills: 1, interestSent: false, assignedAt: "2026-10-01T00:00:00Z",
  sourceUrl: "https://jobs.example.com/acme/" + (over.matchId ?? 1), sourceName: "Company site", quickInfo: "Quick note from the marketer.", sourceSample: true, ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: "2026-10-14T00:00:00Z",
  name: "Anika Rao",
  tiles: { total: tile(3, 50), high: tile(2, 100), awaiting: tile(1), inReview: tile(1), declined: tile(0) },
  rows: [
    orow({ matchId: 1 }),
    orow({ matchId: 2, title: "Cloud Architect", status: "IN_REVIEW", priority: "MEDIUM", daysLeft: 8, marketer: null, priorityDerived: true, dueDerived: true, dueOn: "2026-10-22" }),
    orow({ matchId: 3, title: "Data Engineer", status: "DECLINED", priority: "LOW", daysLeft: -1, dueOn: "2026-10-13" }),
  ],
  page: 0,
  size: 50,
  total: 3,
  sort: "due",
  nextSteps: { toRespond: 1, soonestDueDays: 2, resumeGaps: 2, upcomingInterviews: 1, hasMarketer: true },
  ...over,
});

const detail = (matchId: number) => ({
  row: orow({ matchId }),
  description: "Build and run services.",
  employment: "CONTRACT",
  duration: "6 months",
  experienceLevel: "SENIOR",
  skills: [{ skill: "Java", present: true }, { skill: "Kubernetes", present: false }],
  rateMinMinor: 8500,
  rateMaxMinor: 9500,
  rateUnit: "HOUR",
  currency: "USD",
  reason: "Skills align with this role.",
  declineReason: null,
  infoRequest: null,
  resumeUpdateNote: null,
  interestSentAt: null,
  timeline: [{ key: "ASSIGNED", label: "Assigned to you by Michael Torres", at: "2026-10-01T00:00:00Z" }],
});

type Call = { method: string; url: string; body?: string };
let calls: Call[];
let current: ReturnType<typeof page>;
let writeStatus = 200;
let writeBody: unknown = {};

beforeEach(() => {
  calls = [];
  current = page();
  writeStatus = 200;
  writeBody = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body as string | undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") return json(writeBody, writeStatus);
      const m = /opportunities\/(\d+)$/.exec(url);
      return m ? json(detail(Number(m[1]))) : json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
async function mount() {
  const v = render(
    <ToastProvider>
      <OpportunitiesPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await flush();
  return v;
}
const chipOf = (k: string) => document.querySelector(`[data-chip="${k}"]`) as HTMLElement;
const rowAction = (id: number, title: string, name: string | RegExp) => {
  fireEvent.click(within(rowOf(id)).getByRole("button", { name: `More actions for ${title}` }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
};
const itemOff = (name: RegExp) => {
  const el = screen.getByRole("menuitem", { name });
  return (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
};
const rowOf = (id: number) => document.querySelector(`tr[data-opp="${id}"]`) as HTMLElement;
const writes = () => calls.filter((c) => c.method === "POST");

describe("Assigned Opportunities from real data", () => {
  it("draws a chip row with counts and the table from the API, with no tiles, deltas, Quick Actions or help card", async () => {
    await mount();
    expect(calls[0]).toEqual({ method: "GET", url: "/api/orgs/2/me-workspace/opportunities?sort=due&size=50", body: undefined });
    expect(document.querySelector("[data-stat-tile]")).toBeNull();
    expect(screen.queryByText(/vs last month|Quick Actions|Ask a question/)).toBeNull();
    expect(chipOf("all").textContent).toBe("All3");
    expect(chipOf("needs").textContent).toBe("Needs response1");
    expect(chipOf("review").textContent).toBe("In review1");
    expect(chipOf("declined").textContent).toBe("Declined1");
    expect(document.querySelector("[data-consultant-opportunities][data-status=ready]")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Assigned opportunities" })).toBeTruthy();
    const r1 = rowOf(1);
    expect(within(r1).getByText("Java | Spring Boot")).toBeTruthy();
    expect(within(r1).getByText("New")).toBeTruthy();
    expect(within(r1).getByText("High")).toBeTruthy();
    expect(within(r1).getByText("2 days left").className).toContain("coral");
    expect(within(rowOf(2)).getByText("8 days left").className).not.toContain("coral");
    expect(within(rowOf(2)).getByText("In Review")).toBeTruthy();
    expect(within(rowOf(3)).getByText("Declined", { selector: "span.block" })).toBeTruthy();
    expect(rowOf(2).textContent).toContain("-"); // no marketer: an honest dash
  });

  it("each row has an Open job link; the sheet shows the quick info, the sample mark and the helper; no link means a disabled control with a tooltip", async () => {
    current = page({ rows: [orow({ matchId: 1 }), orow({ matchId: 2, title: "Cloud Architect", sourceUrl: null, quickInfo: null, sourceName: null, sourceSample: false })] });
    await mount();
    const link = within(rowOf(1)).getByRole("link", { name: /Open job link for Senior Java Developer on Company site/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://jobs.example.com/acme/1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const missing = rowOf(2).querySelector("[data-job-link-missing]") as HTMLElement;
    expect(missing.getAttribute("title")).toBe("Your marketer hasn't added the link yet");
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "View Senior Java Developer" }));
    await flush();
    const d = document.querySelector("[data-detail='1']") as HTMLElement;
    expect(within(d).getByText("Marketer's quick info")).toBeTruthy();
    expect(within(d).getByText("Quick note from the marketer.")).toBeTruthy();
    expect(d.querySelector("[data-sample]")).not.toBeNull();
    expect(within(d).getByText("Marketer's job notes")).toBeTruthy();
    expect(d.textContent).toMatch(/Apply on the source site with the browser extension/);
    expect(within(d).getByRole("link", { name: /Open job link/ }).getAttribute("href")).toBe("https://jobs.example.com/acme/1");
  });

  it("asks the API to sort", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "priority" } });
    await flush();
    expect(calls.some((c) => c.url === "/api/orgs/2/me-workspace/opportunities?sort=priority&size=50")).toBe(true);
  });

  it("View opens the side sheet with description, skills, rate, reason and timeline", async () => {
    await mount();
    fireEvent.click(within(rowOf(2)).getByRole("button", { name: "View Cloud Architect" }));
    await flush();
    expect(calls.map((c) => c.url)).toContain("/api/orgs/2/me-workspace/opportunities/2");
    const d = document.querySelector("[data-detail='2']") as HTMLElement;
    expect(within(d).getByText("Build and run services.")).toBeTruthy();
    expect(within(d).getByText(/\$85-95\/hr/)).toBeTruthy();
    expect(within(d).getByText("Skills align with this role.")).toBeTruthy();
    expect((d.querySelector("[data-skill='Kubernetes']") as HTMLElement).dataset.present).toBe("false");
    expect(within(d).getByText("Assigned to you by Michael Torres")).toBeTruthy();
  });

  it("Express Interest posts once and a refusal shows the API message", async () => {
    await mount();
    writeStatus = 422;
    writeBody = { error: "We never store a bank account number" };
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "More actions for Senior Java Developer" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Express Interest/ }));
    await flush();
    expect(document.querySelector("[data-notice]")!.textContent).toContain("We never store");
    writeStatus = 200;
    rowAction(1, "Senior Java Developer", /Express Interest/);
    await flush();
    expect(writes().map((c) => c.url)).toEqual(["/api/orgs/2/me-workspace/opportunities/1/express-interest", "/api/orgs/2/me-workspace/opportunities/1/express-interest"]);
  });

  it("Need More Info needs 3 characters and posts the message", async () => {
    await mount();
    rowAction(1, "Senior Java Developer", /Need More Info/);
    const send = screen.getByRole("button", { name: "Send question" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("What would you like to know?"), { target: { value: "Is the start date flexible?" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await flush();
    expect(writes()).toEqual([{ method: "POST", url: "/api/orgs/2/me-workspace/opportunities/1/need-more-info", body: JSON.stringify({ message: "Is the start date flexible?" }) }]);
  });

  it("Decline requires a reason, posts it and offers undo; a refusal stays in the dialog", async () => {
    await mount();
    rowAction(1, "Senior Java Developer", /Decline Opportunity/);
    fireEvent.change(screen.getByLabelText("Why is it not a fit?"), { target: { value: "Too far to commute" } });
    writeStatus = 422;
    writeBody = { error: "Please remove the date of birth" };
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("date of birth");
    writeStatus = 200;
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await flush();
    expect(writes().at(-1)).toEqual({ method: "POST", url: "/api/orgs/2/me-workspace/opportunities/1/decline", body: JSON.stringify({ reason: "Too far to commute" }) });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(writes().at(-1)!.url).toBe("/api/orgs/2/me-workspace/opportunities/1/reopen");
  });

  it("a declined row offers Reopen instead of the answers, and Request Resume Update note is optional", async () => {
    await mount();
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: "More actions for Data Engineer" }));
    expect(screen.getByRole("menuitem", { name: /Reopen/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Decline Opportunity/ })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    rowAction(1, "Senior Java Developer", /Request Resume Update/);
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await flush();
    expect(writes().at(-1)).toMatchObject({ url: "/api/orgs/2/me-workspace/opportunities/1/request-resume-update", body: "{}" });
  });

  it("the right rail is only the next steps, worked out from the counts", async () => {
    await mount();
    const steps = document.querySelector("[data-home-card='opps-steps']") as HTMLElement;
    expect(within(steps).getByText("Respond to 1 opportunity")).toBeTruthy();
    expect(within(steps).getByText("Update your resume")).toBeTruthy();
    expect(within(steps).getByText("Prepare for upcoming interviews")).toBeTruthy();
    expect(within(steps).getByRole("link", { name: /Discuss priorities with your marketer/ }).getAttribute("href")).toBe("/w/consultant/marketer");
    expect(document.querySelector("[data-quick-target]")).toBeNull();
    expect(document.querySelector("[data-home-card='help']")).toBeNull();
  });

  it("the chips filter the rows", async () => {
    await mount();
    fireEvent.click(chipOf("declined"));
    expect(document.querySelectorAll("tr[data-opp]")).toHaveLength(1);
    expect(rowOf(3)).toBeTruthy();
    fireEvent.click(chipOf("all"));
    expect(document.querySelectorAll("tr[data-opp]")).toHaveLength(3);
  });

  it("honest empty states: a sentence and no next steps", async () => {
    current = page({ rows: [], total: 0, tiles: { total: tile(0), high: tile(0), awaiting: tile(0), inReview: tile(0), declined: tile(0) }, nextSteps: { toRespond: 0, soonestDueDays: null, resumeGaps: 0, upcomingInterviews: 0, hasMarketer: false } });
    await mount();
    expect(screen.getByText(/No opportunities are assigned to you yet/)).toBeTruthy();
    expect(chipOf("all").textContent).toBe("All0");
    expect(screen.queryByText(/Respond to/)).toBeNull();
  });

  it("a 404 is the role panel and a failure is retryable", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => new Response("{}", { status: 404 }));
    await mount();
    expect(screen.getByText("This page isn't part of your role")).toBeTruthy();
    cleanup();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    await mount();
    expect(screen.getByText(/didn't load/)).toBeTruthy();
  });
});

describe("one answer shared with the marketer", () => {
  it("I applied asks first, then posts the consultant's own statement and tells them the marketer can see it", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "More actions for Senior Java Developer" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "I applied" }));
    await flush();
    expect(writes()).toEqual([]);
    expect(document.querySelector("[data-applied-confirm]")!.textContent).toMatch(/No one applies or submits for you/);
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    await flush();
    expect(writes()).toEqual([]);

    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "More actions for Senior Java Developer" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "I applied" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Yes, I applied" }));
    await flush();
    expect(writes()).toEqual([{ method: "POST", url: "/api/orgs/2/me-workspace/opportunities/1/applied", body: JSON.stringify({}) }]);
    expect(screen.getByText("Marked as applied. Your marketer can see it.")).toBeTruthy();
  });

  it("an applied row is a statement, not work: an Applied pill, no actions, no due pressure", async () => {
    current = page({ rows: [orow({ matchId: 1, status: "APPLIED", daysLeft: -4, allowedActions: [] })] });
    await mount();
    expect(within(rowOf(1)).getByText("Applied", { selector: "span:not(.block)" })).toBeTruthy();
    expect(within(rowOf(1)).getByText("Applied", { selector: "span.block" }).className).not.toContain("coral");
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "More actions for Senior Java Developer" }));
    for (const n of [/Express Interest/, /Need More Info/, /Request Resume Update/, /Decline Opportunity/]) expect(itemOff(n)).toBe(true);
    expect(writes()).toEqual([]);
  });

  it("the buttons follow allowedActions: a closed job leaves only the resume note and Decline", async () => {
    current = page({ rows: [orow({ matchId: 1, allowedActions: ["RESUME_UPDATE", "DECLINE"] })] });
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "More actions for Senior Java Developer" }));
    expect(itemOff(/Express Interest/)).toBe(true);
    expect(itemOff(/Need More Info/)).toBe(true);
    expect(itemOff(/Request Resume Update/)).toBe(false);
    expect(itemOff(/Decline Opportunity/)).toBe(false);  });

  it("the marketer's answer to the question shows on the details, and the row says Answered", async () => {
    current = page({ rows: [orow({ matchId: 1, status: "AWAITING_RESPONSE", infoAnswered: true })] });
    const withAnswer = { ...detail(1), row: orow({ matchId: 1, status: "AWAITING_RESPONSE", infoAnswered: true }), infoRequest: "Is this role fully remote?", infoAnswer: "Yes, fully remote within the US." };
    const base = (fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation()! as (u: string, i?: RequestInit) => Promise<Response>;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init: RequestInit = {}) =>
      /opportunities\/1$/.test(url) && (init.method ?? "GET") === "GET" ? new Response(JSON.stringify(withAnswer), { status: 200 }) : base(url, init),
    );
    await mount();
    expect(within(rowOf(1)).getByText("Answered")).toBeTruthy();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "View Senior Java Developer" }));
    await flush();
    const thread = document.querySelector("[data-info-thread]") as HTMLElement;
    expect(within(thread).getByText("Is this role fully remote?")).toBeTruthy();
    expect(within(thread).getByText(/Michael Torres answered/)).toBeTruthy();
    expect(within(thread).getByText("Yes, fully remote within the US.")).toBeTruthy();
  });

  it("a question still waiting says so instead of showing an answer", async () => {
    const waiting = { ...detail(2), row: orow({ matchId: 2, status: "AWAITING_RESPONSE" }), infoRequest: "Any travel?", infoAnswer: null };
    const base = (fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation()! as (u: string, i?: RequestInit) => Promise<Response>;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init: RequestInit = {}) =>
      /opportunities\/2$/.test(url) && (init.method ?? "GET") === "GET" ? new Response(JSON.stringify(waiting), { status: 200 }) : base(url, init),
    );
    await mount();
    fireEvent.click(within(rowOf(2)).getByRole("button", { name: "View Cloud Architect" }));
    await flush();
    const thread = document.querySelector("[data-info-thread]") as HTMLElement;
    expect(thread.textContent).toMatch(/Waiting for your marketer to answer/);
    expect(document.querySelector("[data-info-answer]")).toBeNull();
  });

  it("the deep link opens that job's details, even one beyond the first page, and a job that is not theirs is 'not available'", async () => {
    const onlyHere = { ...detail(77), row: orow({ matchId: 77, title: "Beyond The First Page" }) };
    const base = (fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation()! as (u: string, i?: RequestInit) => Promise<Response>;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (/opportunities\/77$/.test(url)) return new Response(JSON.stringify(onlyHere), { status: 200 });
      if (/opportunities\/404$/.test(url)) return new Response("{}", { status: 404 });
      return base(url, init);
    });
    render(
      <ToastProvider>
        <OpportunitiesPage orgId={2} firstName="Anika Rao" initialOpenId={77} />
      </ToastProvider>,
    );
    await flush();
    expect(document.querySelector("[data-detail='77']")).not.toBeNull();
    expect(document.querySelector("[data-con-detail-missing]")).toBeNull();
    cleanup();
    render(
      <ToastProvider>
        <OpportunitiesPage orgId={2} firstName="Anika Rao" initialOpenId={404} />
      </ToastProvider>,
    );
    await flush();
    expect(document.querySelector("[data-con-detail-missing]")!.textContent).toMatch(/isn't available/);
  });
});
