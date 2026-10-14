// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/job-discovery" }));

import JobDiscoveryPage from "./JobDiscoveryPage";

type W = Record<string, unknown>;
const NOW = Date.now();
const job = (id: number, over: W = {}): W => ({
  id,
  title: `Job ${id}`,
  clientId: 1,
  clientName: "TechCorp",
  industry: "Finance",
  location: "New York, NY",
  workMode: "HYBRID",
  employment: "CONTRACT",
  duration: "6 months",
  experience: "SENIOR",
  rateMinMinor: 9500,
  rateMaxMinor: 12000,
  rateUnit: "HOUR",
  currency: "USD",
  skills: ["Python", "SQL", "AWS"],
  postedAt: new Date(NOW - 2 * 86400e3).toISOString(),
  featured: false,
  saved: false,
  score: 92,
  scoreSource: "MATCH",
  matchedSkills: 3,
  totalSkills: 3,
  relation: "NONE",
  applicationStage: null,
  sourceUrl: "https://jobs.example.com/acme/" + id,
  sourceName: "LinkedIn",
  quickInfo: "Contract role, apply on the site.",
  sourceSample: true,
  ...over,
});

const overview = (over: W = {}): W => ({
  orgId: 2,
  generatedAt: new Date(NOW).toISOString(),
  me: { consultantId: 5, name: "Anika Rao" },
  openJobs: 128,
  filterOptions: {
    jobTypes: [{ value: "CONTRACT", label: "CONTRACT", count: 80 }],
    experience: [{ value: "SENIOR", label: "SENIOR", count: null }],
    workModes: [{ value: "REMOTE", label: "REMOTE", count: 40 }],
    industries: [{ value: "Finance", label: "Finance", count: 20 }],
    clients: [{ value: "1", label: "TechCorp", count: 12 }],
    skills: [{ value: "AWS", label: "AWS", count: 33 }],
  },
  recommended: [
    { key: "workMode:REMOTE", label: "Remote Friendly", kind: "workMode", value: "REMOTE", source: "profile" },
    { key: "skill:aws", label: "AWS", kind: "skill", value: "AWS", source: "profile" },
  ],
  trending: [
    { skill: "AWS", openJobs: 33, recent: 14, prior: 10, changePct: 40 },
    { skill: "Python", openJobs: 30, recent: 9, prior: 1, changePct: null },
    { skill: "SQL", openJobs: 20, recent: 5, prior: 5, changePct: 0 },
  ],
  savedSearches: [{ id: 11, name: "Data Engineer - Remote", filters: { q: "data engineer", workMode: "REMOTE" }, newResults: 4, createdAt: "2026-10-01T00:00:00Z", lastViewedAt: "2026-10-01T00:00:00Z" }],
  recentSearches: [{ id: 21, label: "AWS, Contract", filters: { skill: "AWS", jobType: "CONTRACT" }, at: new Date(NOW - 2 * 3600e3).toISOString() }],
  ...over,
});

type Call = { method: string; url: string; body: string | null };
let calls: Call[];
let jobs: W[];
let detail: W;
let saveStatus = 200;

function stubFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: typeof init.body === "string" ? init.body : null });
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.endsWith("/overview")) return json(200, overview());
      if (url.includes("/search?")) return json(200, { orgId: 2, total: jobs.length === 2 ? 128 : jobs.length, page: 0, size: 10, sort: "match", items: jobs });
      if (url.includes("/jobs/")) return json(200, detail);
      if (url.includes("/saved/")) return saveStatus === 200 ? json(200, { saved: method === "POST" }) : json(saveStatus, { error: "no" });
      if (url.includes("/recent-searches")) return json(200, { id: 1 });
      if (url.includes("/saved-searches")) return method === "DELETE" ? new Response(null, { status: 204 }) : json(200, { id: 11, name: "x", filters: {}, newResults: 0 });
      return json(404, {});
    }),
  );
}

const searches = () => calls.filter((c) => c.url.includes("/search?")).map((c) => new URLSearchParams(c.url.split("?")[1]));

async function mount() {
  render(<JobDiscoveryPage orgId={2} firstName="Anika Rao" />);
  await screen.findByRole("heading", { name: /^Showing/ });
}

beforeEach(() => {
  jobs = [
    job(1, { title: "Data Engineer", featured: true, rateMinMinor: 9500, rateMaxMinor: 12000 }),
    job(2, { title: "Cloud Architect", clientName: "GlobalTech", score: 78, scoreSource: "SKILLS", matchedSkills: 2, totalSkills: 3, relation: "ASSIGNED", workMode: "REMOTE", skills: ["AWS", "Azure", "A", "B", "C", "D", "E"] }),
  ];
  detail = { job: job(1, { title: "Data Engineer" }), description: "Build pipelines.", openPositions: 2 };
  saveStatus = 200;
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Job Discovery", () => {
  it("draws the API's jobs: count, title, client, place, type, duration, rate, skills, featured and the match ring", async () => {
    await mount();
    expect(screen.getByRole("heading", { name: "Showing 128 opportunities" })).toBeTruthy();
    const card = document.querySelector("[data-job='1']") as HTMLElement;
    expect(within(card).getByRole("button", { name: "Data Engineer" })).toBeTruthy();
    expect(within(card).getByText("TechCorp")).toBeTruthy();
    expect(within(card).getByText("New York, NY")).toBeTruthy();
    expect(within(card).getByText("Contract")).toBeTruthy();
    expect(within(card).getByText("6 months")).toBeTruthy();
    expect(within(card).getByText("$95 - $120/hr")).toBeTruthy();
    expect(within(card).getByText("Featured")).toBeTruthy();
    expect(within(card).getByText("Excellent match")).toBeTruthy();
    expect(card.querySelector("[data-match='92']")).not.toBeNull();
    const second = document.querySelector("[data-job='2']") as HTMLElement;
    expect(within(second).getByText("Good match")).toBeTruthy();
    expect(within(second).getByText("You have 2 of 3 required skills.")).toBeTruthy();
    expect(within(second).getByText("Remote")).toBeTruthy();
    expect(within(second).getByText("+1")).toBeTruthy();
    expect(within(second).queryByText("Featured")).toBeNull();
  });

  it("asks the API with the search text and never filters the page itself", async () => {
    await mount();
    expect(searches()[0].get("sort")).toBe("match");
    expect(searches()[0].has("q")).toBe(false);
    fireEvent.change(screen.getByPlaceholderText(/Job title, skill/), { target: { value: "data engineer" } });
    fireEvent.change(screen.getByPlaceholderText(/^Location/), { target: { value: "Remote" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(searches().some((p) => p.get("q") === "data engineer" && p.get("location") === "Remote")).toBe(true));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/recent-searches"))).toBe(true));
    const rec = calls.find((c) => c.url.endsWith("/recent-searches"))!;
    expect(JSON.parse(rec.body!).q).toBe("data engineer");
    // both cards stay: the page shows what the API returned, whatever the text
    expect(document.querySelectorAll("[data-job]")).toHaveLength(2);
  });

  it("a recommended filter chip applies its filter in the query and toggles off again", async () => {
    await mount();
    const chip = document.querySelector("[data-chip='skill:aws']") as HTMLElement;
    fireEvent.click(chip);
    await waitFor(() => expect(searches().some((p) => p.get("skill") === "AWS")).toBe(true));
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    const before = searches().length;
    fireEvent.click(chip);
    await waitFor(() => expect(searches().length).toBeGreaterThan(before));
    expect(searches()[searches().length - 1].has("skill")).toBe(false);
    fireEvent.click(document.querySelector("[data-chip='workMode:REMOTE']") as HTMLElement);
    await waitFor(() => expect(searches().some((p) => p.get("workMode") === "REMOTE")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Clear All" }));
    await waitFor(() => expect(searches()[searches().length - 1].has("workMode")).toBe(false));
  });

  it("Save toggles the bookmark through the API and rolls back on failure", async () => {
    await mount();
    const save = screen.getByRole("button", { name: "Save Data Engineer" });
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/saved/1"))).toBe(true));
    const saved = await screen.findByRole("button", { name: "Remove Data Engineer from saved jobs" });
    expect(saved.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(saved);
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/saved/1"))).toBe(true));
    await screen.findByRole("button", { name: "Save Data Engineer" });
    saveStatus = 500;
    fireEvent.click(screen.getByRole("button", { name: "Save Cloud Architect" }));
    await screen.findByText("Couldn't update your saved jobs. Nothing was changed.");
    expect(screen.getByRole("button", { name: "Save Cloud Architect" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("View opens the detail sheet with the marketer's quick info, job notes and the open-link action", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "View Data Engineer" }));
    const body = await waitFor(() => {
      const el = document.querySelector("[data-job-detail='1']");
      if (!el) throw new Error("not yet");
      return el as HTMLElement;
    });
    expect(within(body).getByText("Marketer's quick info")).toBeTruthy();
    expect(within(body).getByText("Contract role, apply on the site.")).toBeTruthy();
    expect(within(body).getByText("Build pipelines.")).toBeTruthy();
    expect(within(body).getByText("Marketer's job notes")).toBeTruthy();
    expect(within(body).getByText(/not the full posting/)).toBeTruthy();
    const link = within(body).getByRole("link", { name: /Open job link for Data Engineer/ });
    expect(link.getAttribute("href")).toBe("https://jobs.example.com/acme/1");
    expect(calls.some((c) => c.url.endsWith("/jobs/1"))).toBe(true);
  });

  it("each card leads with the marketer's quick info, the Sample mark and an Open job link that opens a new tab safely; no Apply button exists", async () => {
    await mount();
    expect(document.querySelector("[data-apply-helper]")?.textContent).toMatch(/Apply on the source site with the Kiwiply extension/);
    expect(document.querySelector("[data-apply-helper]")?.textContent).toMatch(/My Applications/);
    const card = document.querySelector("[data-job='1']") as HTMLElement;
    expect(within(card).getByText("Marketer's quick info")).toBeTruthy();
    expect(within(card).getByText("Contract role, apply on the site.")).toBeTruthy();
    expect(within(card).getByText("LinkedIn")).toBeTruthy();
    expect(card.querySelector("[data-sample]")).not.toBeNull();
    const link = within(card).getByRole("link", { name: /Open job link for Data Engineer on LinkedIn/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://jobs.example.com/acme/1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button", { name: /^Apply/ })).toBeNull();
    expect(calls.some((c) => c.url.includes("/apply"))).toBe(false);
  });

  it("a job without a link has a disabled Open job link with an honest tooltip; an unsafe link is never rendered as a link", async () => {
    jobs = [job(1, { title: "Data Engineer", sourceUrl: null, quickInfo: null, sourceName: null, sourceSample: false }), job(2, { title: "Cloud Architect", sourceUrl: "javascript:alert(1)" })];
    await mount();
    const card = document.querySelector("[data-job='1']") as HTMLElement;
    const missing = card.querySelector("[data-job-link-missing]") as HTMLElement;
    expect(missing.getAttribute("title")).toBe("Your marketer hasn't added the link yet");
    const btn = within(card).getByRole("button", { name: /Open job link for Data Engineer/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(within(card).queryByText("Marketer's quick info")).toBeNull();
    const second = document.querySelector("[data-job='2']") as HTMLElement;
    expect(within(second).queryByRole("link", { name: /Open job link/ })).toBeNull();
    expect(second.querySelector("[data-job-link-missing]")).not.toBeNull();
  });

  it("right rail: saved searches with new counts, trending skills with real demand text, recent searches", async () => {
    await mount();
    const saved = document.querySelector("[data-home-card='jd-saved']") as HTMLElement;
    expect(within(saved).getByText("Data Engineer - Remote")).toBeTruthy();
    expect(within(saved).getByText("4 new results")).toBeTruthy();
    const trending = document.querySelector("[data-home-card='jd-trending']") as HTMLElement;
    expect(within(trending).getByText("↗ +40% demand")).toBeTruthy();
    expect(within(trending).getByText("30 open jobs")).toBeTruthy(); // no comparison when the earlier window was too small
    expect(within(trending).getByText("steady demand")).toBeTruthy();
    const recent = document.querySelector("[data-home-card='jd-recent']") as HTMLElement;
    expect(within(recent).getByText("AWS, Contract")).toBeTruthy();
    expect(within(recent).getByText("2 hours ago")).toBeTruthy();
    fireEvent.click(within(recent).getByRole("button", { name: "Search again: AWS, Contract" }));
    await waitFor(() => expect(searches().some((p) => p.get("skill") === "AWS" && p.get("jobType") === "CONTRACT")).toBe(true));
  });

  it("running a saved search sends its filters and restarts its counter", async () => {
    await mount();
    const saved = document.querySelector("[data-home-card='jd-saved']") as HTMLElement;
    fireEvent.click(within(saved).getByRole("button", { name: "Run saved search Data Engineer - Remote" }));
    await waitFor(() => expect(searches().some((p) => p.get("q") === "data engineer" && p.get("workMode") === "REMOTE")).toBe(true));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/saved-searches/11/viewed"))).toBe(true));
  });

  it("the Saved Searches tab lists them and deleting calls the API", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Saved Searches/ }));
    const row = await waitFor(() => {
      const el = document.querySelector("[data-saved-search='11']");
      if (!el) throw new Error("not yet");
      return el as HTMLElement;
    });
    expect(within(row).getByText("data engineer, Remote")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Delete saved search Data Engineer - Remote" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/saved-searches/11"))).toBe(true));
  });

  it("Recommended for You asks for a minimum score and sorted by match", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Recommended for You/ }));
    await waitFor(() => expect(searches().some((p) => p.get("minScore") === "60" && p.get("sort") === "match")).toBe(true));
  });

  it("More Filters saves the search under a name and shows the API's refusal sentence", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /More Filters/ }));
    fireEvent.change(screen.getByPlaceholderText(/Job title, skill/), { target: { value: "java" } });
    fireEvent.change(screen.getByPlaceholderText(/^Name, e.g./), { target: { value: "Java roles" } });
    fireEvent.click(screen.getByRole("button", { name: "Save search" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/saved-searches"))).toBe(true));
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/saved-searches"))!;
    expect(JSON.parse(post.body!)).toMatchObject({ name: "Java roles", filters: { q: "java" } });
    await screen.findByText("Search saved.");
  });

  it("a job with no score shows 'Not scored', not a number", async () => {
    jobs = [job(3, { title: "Mystery", score: null, scoreSource: null, matchedSkills: 0, totalSkills: 0 })];
    await mount();
    const card = document.querySelector("[data-job='3']") as HTMLElement;
    expect(within(card).getByText("Not scored")).toBeTruthy();
    expect(card.querySelector("[data-match='none']")).not.toBeNull();
  });

  it("honest empty states: no matches, and no trending data", async () => {
    jobs = [];
    stubFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
        if (url.endsWith("/overview")) return json(overview({ trending: [], savedSearches: [], recentSearches: [], recommended: [] }));
        return json({ orgId: 2, total: 0, page: 0, size: 10, sort: "match", items: [] });
      }),
    );
    await mount();
    expect(screen.getByRole("heading", { name: "Showing 0 opportunities" })).toBeTruthy();
    expect(screen.getByText(/No jobs match these filters/)).toBeTruthy();
    expect(screen.getByText(/Not enough open jobs yet/)).toBeTruthy();
    expect(screen.getByText(/No saved searches yet/)).toBeTruthy();
    expect(screen.getByText(/Your last searches will show up here/)).toBeTruthy();
    expect(document.querySelector("[data-chip]")).toBeNull();
  });

  it("a 404 from the API (not a consultant) shows the role message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 })));
    render(<JobDiscoveryPage orgId={2} firstName="Sarah" />);
    await screen.findByText(/isn't part of your role/);
    expect(document.querySelector("[data-job]")).toBeNull();
  });
});
