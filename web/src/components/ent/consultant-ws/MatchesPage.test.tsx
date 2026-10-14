// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/matches" }));

import { OPEN_HELP_EVENT } from "@/components/ent/shell/ShellContext";
import MatchesPage from "./MatchesPage";

const NOW = Date.now();
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const tile = (value: number, deltaPct: number | null = null) => ({ value, previous: 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value] });
const mrow = (over: Record<string, unknown>) => ({
  matchId: 1, requirementId: 10, title: "Senior Java Developer", company: "TechCorp", location: "Austin, TX", workMode: "REMOTE", employment: "CONTRACT", score: 94, skillFit: 100,
  postedAt: ago(2 * DAY), rateMinMinor: 8500, rateMaxMinor: 9500, rateUnit: "HOUR", currency: "USD", saved: false, viewed: false, interestSent: false,
  sourceUrl: "https://jobs.example.com/acme/" + (over.matchId ?? 1), sourceName: "LinkedIn", quickInfo: "Quick note from the marketer.", sourceSample: true, ...over,
});

const page = (over: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: new Date(NOW).toISOString(),
  name: "Anika Rao",
  tiles: { total: tile(3, 50), high: tile(2, 100), fresh: tile(1), saved: tile(1), viewed: tile(0) },
  matches: [
    mrow({ matchId: 1 }),
    mrow({ matchId: 2, title: "Full Stack Developer", company: "InnovateTech", score: 88, skillFit: 60, employment: "FTE", workMode: "HYBRID", postedAt: ago(3 * DAY), rateMinMinor: null, rateMaxMinor: null, saved: true }),
    mrow({ matchId: 3, title: "Data Engineer", company: "FinServe Inc", score: 76, skillFit: null, postedAt: ago(6 * DAY), interestSent: true }),
  ],
  quality: { percent: 60, checks: [{ key: "profile", label: "Keep your profile up to date", done: true }, { key: "resume", label: "Upload latest resume", done: false }] },
  alerts: [{ key: "new-matches", kind: "NEW_MATCHES", title: "1 new job match", detail: "Based on your profile and preferences", at: ago(2 * 3600e3) }],
  ...over,
});

const detail = (matchId: number) => ({
  match: mrow({ matchId }),
  reason: "Skills and experience align with this role.",
  skills: [
    { skill: "Java", present: true, primary: true, percent: 100 },
    { skill: "Kubernetes", present: false, primary: false, percent: 0 },
  ],
  explanation: [{ key: "skills", text: "You have 1 of the 2 skills this role lists (Java).", ok: true }],
  improvements: [
    { tag: "GAP", title: "Kubernetes", text: "Consider gaining hands-on experience with Kubernetes." },
    { tag: "SUGGESTED", title: "Certifications", text: "Add certifications." },
  ],
  interestSentAt: null,
  interestNote: null,
});

type Call = { method: string; url: string };
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
      calls.push({ method, url });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") {
        const hit = /matches\/(\d+)\/interest$/.exec(url);
        if (hit && writeStatus === 200) current = { ...current, matches: current.matches.map((m) => (m.matchId === Number(hit[1]) ? { ...m, interestSent: true } : m)) };
        return json(writeBody, writeStatus);
      }
      const m = /matches\/(\d+)$/.exec(url);
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
  const v = render(<MatchesPage orgId={2} firstName="Anika Rao" />);
  await flush();
  return v;
}
const tileOf = (k: string) => document.querySelector(`[data-stat-tile="${k}"]`) as HTMLElement;
const rowOf = (id: number) => document.querySelector(`tr[data-match="${id}"]`) as HTMLElement;
const titles = () => [...document.querySelectorAll("tr[data-match]")].map((r) => r.querySelector("td:nth-child(2)")!.textContent);

describe("Job Matches from real data", () => {
  it("draws the tiles and the ranked table from the API", async () => {
    await mount();
    expect(calls[0]).toEqual({ method: "GET", url: "/api/orgs/2/me-workspace/matches" });
    expect(within(tileOf("total")).getByText("3")).toBeTruthy();
    expect(within(tileOf("total")).getByText(/50%/)).toBeTruthy();
    expect(within(tileOf("viewed")).getByText("0")).toBeTruthy();
    expect(titles()).toEqual(["Senior Java Developer", "Full Stack Developer", "Data Engineer"]);
    expect(within(rowOf(1)).getByText("94%")).toBeTruthy();
    expect(within(rowOf(1)).getByText("2 days ago")).toBeTruthy();
    expect(within(rowOf(1)).getByLabelText("Skill fit 100%")).toBeTruthy();
    expect(within(rowOf(3)).queryByLabelText(/Skill fit/)).toBeNull();
    expect(within(rowOf(3)).getByText("Interest sent")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your Matched Jobs" })).toBeTruthy();
  });

  it("each row has an Open job link (new tab, noopener) and the detail leads with the marketer's quick info; no link means a disabled control with a tooltip", async () => {
    await mount();
    const link = within(rowOf(1)).getByRole("link", { name: /Open job link for Senior Java Developer on LinkedIn/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://jobs.example.com/acme/1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const d = document.querySelector("[data-detail='1']") as HTMLElement;
    expect(within(d).getByText("Marketer's quick info")).toBeTruthy();
    expect(within(d).getByText("Quick note from the marketer.")).toBeTruthy();
    expect(d.querySelector("[data-sample]")).not.toBeNull();
    expect(within(d).getByRole("link", { name: /Open job link/ }).getAttribute("href")).toBe("https://jobs.example.com/acme/1");
    expect(d.textContent).toMatch(/Apply on the source site with the Kiwiply extension/);
    expect(d.textContent).toMatch(/My Applications/);
  });

  it("a match without a usable link shows a disabled Open job link with the honest tooltip", async () => {
    current = page({ matches: [mrow({ matchId: 1, sourceUrl: null, quickInfo: null, sourceName: null, sourceSample: false }), mrow({ matchId: 2, title: "Full Stack Developer", sourceUrl: "http://insecure.example.com/x" })] });
    await mount();
    for (const id of [1, 2]) {
      const m = rowOf(id).querySelector("[data-job-link-missing]") as HTMLElement;
      expect(m.getAttribute("title")).toBe("Your marketer hasn't added the link yet");
      expect((m.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
      expect(within(rowOf(id)).queryByRole("link", { name: /Open job link/ })).toBeNull();
    }
  });

  it("selects the best match by default and shows its insights", async () => {
    await mount();
    expect(calls.map((c) => c.url)).toContain("/api/orgs/2/me-workspace/matches/1");
    const d = document.querySelector("[data-detail='1']") as HTMLElement;
    expect(within(d).getByText("94% Match")).toBeTruthy();
    expect(within(d).getByText("Skills and experience align with this role.")).toBeTruthy();
    expect((document.querySelector("[data-skill='Java']") as HTMLElement).dataset.present).toBe("true");
    expect((document.querySelector("[data-skill='Kubernetes']") as HTMLElement).dataset.present).toBe("false");
    expect(document.querySelector("[data-improve='GAP']")!.textContent).toContain("Gap");
    expect(document.querySelector("[data-improve='SUGGESTED']")!.textContent).toContain("Suggested");
  });

  it("View Match selects the match and records the view", async () => {
    await mount();
    fireEvent.click(within(rowOf(2)).getByRole("button", { name: "View match for Full Stack Developer" }));
    await flush();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/orgs/2/me-workspace/matches/2/view")).toBe(true);
    expect(document.querySelector("[data-detail='2']")).toBeTruthy();
  });

  it("sorts by rate and filters by score and saved", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "rate" } });
    expect(titles()[0]).toBe("Senior Java Developer");
    expect(titles()[2]).toBe("Full Stack Developer"); // no rate listed: last
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.change(screen.getByLabelText("Minimum match score"), { target: { value: "90" } });
    expect(titles()).toEqual(["Senior Java Developer"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByLabelText("Saved only"));
    expect(titles()).toEqual(["Full Stack Developer"]);
    fireEvent.change(screen.getByLabelText("Minimum match score"), { target: { value: "90" } });
    expect(screen.getByText("No matches fit these filters.")).toBeTruthy();
  });

  it("bookmark toggles through PUT and DELETE and rolls back on a failure", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByLabelText("Save Senior Java Developer"));
    await flush();
    expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("/matches/1/save"))).toBe(true);
    fireEvent.click(within(rowOf(2)).getByLabelText("Remove Full Stack Developer from saved jobs"));
    await flush();
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/matches/2/save"))).toBe(true);
    writeStatus = 500;
    fireEvent.click(within(rowOf(3)).getByLabelText("Save Data Engineer"));
    await flush();
    expect(within(rowOf(3)).getByLabelText("Save Data Engineer").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-notice]")!.textContent).toMatch(/didn't save/);
  });

  it("Express Interest posts and shows Interest sent; a refusal shows the API message and changes nothing", async () => {
    await mount();
    writeStatus = 422;
    writeBody = { error: "We never store a bank account number - please remove it (note)" };
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Express interest in Senior Java Developer" }));
    await flush();
    expect(document.querySelector("[data-notice]")!.textContent).toContain("We never store");
    expect(within(rowOf(1)).queryByText("Interest sent")).toBeNull();
    writeStatus = 200;
    writeBody = {};
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: "Express interest in Senior Java Developer" }));
    await flush();
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/matches/1/interest")).length).toBe(2);
    expect(within(rowOf(1)).getByText("Interest sent")).toBeTruthy();
    expect(screen.getByText(/Nothing has been submitted for you/)).toBeTruthy();
  });

  it("compares up to three jobs side by side", async () => {
    await mount();
    expect(document.querySelector("[data-compare-sheet]")).toBeNull();
    fireEvent.click(within(rowOf(1)).getByLabelText("Compare Senior Java Developer"));
    expect(screen.getByText(/Choose at least one more job/)).toBeTruthy();
    fireEvent.click(within(rowOf(2)).getByLabelText("Compare Full Stack Developer"));
    const sheet = document.querySelector("[data-compare-sheet]") as HTMLElement;
    expect(within(sheet).getByText("TechCorp")).toBeTruthy();
    expect(within(sheet).getByText("InnovateTech")).toBeTruthy();
    expect(within(sheet).getByText("$85-95/hr")).toBeTruthy();
    expect(within(sheet).getAllByText("Not listed").length).toBeGreaterThan(0);
    fireEvent.click(within(sheet).getByLabelText("Remove Full Stack Developer from compare"));
    expect(screen.getByText(/Choose at least one more job/)).toBeTruthy();
  });

  it("the right rail: quality checklist, alerts and the bee that opens help", async () => {
    await mount();
    const q = document.querySelector("[data-home-card='matches-quality']") as HTMLElement;
    expect((q.querySelector("[data-check='profile']") as HTMLElement).dataset.done).toBe("true");
    expect((q.querySelector("[data-check='resume']") as HTMLElement).dataset.done).toBe("false");
    expect(within(q).getByRole("link", { name: "Improve My Profile" }).getAttribute("href")).toBe("/w/consultant/profile");
    expect(within(document.querySelector("[data-alert]") as HTMLElement).getByText("2h ago")).toBeTruthy();
    const heard = vi.fn();
    window.addEventListener(OPEN_HELP_EVENT, heard);
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    expect(heard).toHaveBeenCalled();
    window.removeEventListener(OPEN_HELP_EVENT, heard);
  });

  it("honest empty states when there is nothing", async () => {
    current = page({ matches: [], alerts: [], tiles: { total: tile(0), high: tile(0), fresh: tile(0), saved: tile(0), viewed: tile(0) } });
    await mount();
    expect(screen.getByText(/No matches yet/)).toBeTruthy();
    expect(screen.getByText(/Pick a match above/)).toBeTruthy();
    expect(screen.getByText(/No alerts right now/)).toBeTruthy();
    expect(within(tileOf("total")).getByText("0")).toBeTruthy();
    expect(tileOf("total").textContent).not.toMatch(/%/);
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
