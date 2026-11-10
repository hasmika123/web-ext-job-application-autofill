// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/interviews", useSearchParams: () => new URLSearchParams("") }));

import InterviewsPage from "./InterviewsPage";

const NOW = Date.now();
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();
const tile = (value: number, deltaPct: number | null = null) => ({ value, previous: 1, deltaPct, sparkline: [0, 1, 2, 3, 4, value], vs: "last week" });
const irow = (over: Record<string, unknown>) => ({
  id: 1, title: "Senior Java Developer", company: "TechCorp Inc.", location: "Austin, TX", workMode: "HYBRID", round: "Technical", interviewerName: "John Miller", interviewerTitle: null,
  scheduledAt: at(DAY), durationMinutes: 60, status: "SCHEDULED", chip: "UPCOMING", mode: "VIDEO", meetingUrl: "https://meet.example.org/j/1", prepNote: null, hasFeedback: false, ...over,
});

const page = () => ({
  orgId: 2,
  generatedAt: new Date(NOW).toISOString(),
  name: "Anika Rao",
  tiles: { upcoming: tile(2, 100), thisWeek: tile(1), completed: tile(3, 50), feedbackPending: tile(1) },
  upcoming: [
    irow({ id: 2, title: "Data Engineer", company: "DataSphere", scheduledAt: at(10 * DAY), chip: "SCHEDULED", mode: "ONSITE", meetingUrl: null }),
    irow({ id: 1 }),
  ],
  calendar: [
    { id: 1, scheduledAt: at(DAY), state: "UPCOMING", title: "Senior Java Developer", company: "TechCorp Inc." },
    { id: 9, scheduledAt: new Date().toISOString(), state: "COMPLETED", title: "Done Role", company: "Old Co" },
  ],
  feedback: [{ interviewId: 8, title: "Data Engineer", company: "DataSphere", interviewedAt: at(-5 * DAY), outcome: "POSITIVE", summary: "Strong technical skills.", updatedAt: at(-4 * DAY) }],
  pendingFeedback: [{ interviewId: 9, title: "Done Role", company: "Old Co", interviewedAt: at(-2 * DAY) }],
});

const detailFor = (id: number) => {
  const done = id === 9;
  return { interview: irow(done ? { id, title: "Done Role", status: "COMPLETED", chip: null, meetingUrl: null } : { id }), applicationCode: "APP-1", feedback: null, canEditDetails: !done, canRecordFeedback: done };
};

let calls: { method: string; url: string; body?: string }[];
let writeStatus = 200;
let writeBody: unknown = {};

beforeEach(() => {
  calls = [];
  writeStatus = 200;
  writeBody = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body as string | undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") return json(writeStatus === 200 ? detailFor(1) : writeBody, writeStatus);
      const m = /interviews\/(\d+)$/.exec(url);
      return m ? json(detailFor(Number(m[1]))) : json(page());
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
async function mount() {
  const v = render(<InterviewsPage orgId={2} firstName="Anika Rao" />);
  await flush();
  return v;
}
const rowOf = (id: number) => document.querySelector(`tr[data-interview="${id}"]`) as HTMLElement;

describe("Interviews page", () => {
  it("is one page with Schedule and Prepare tabs and no tiles, Quick Actions, preparation rail or help card", async () => {
    await mount();
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["Schedule", "Prepare"]);
    expect(screen.getByRole("tab", { name: "Schedule" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("[data-stat-tile]")).toBeNull();
    expect(document.querySelector("[data-quick]")).toBeNull();
    expect(document.querySelector("[data-home-card='interviews-prep']")).toBeNull();
    expect(screen.queryByText(/Quick Actions|Ask a question|Interview preparation/)).toBeNull();
  });

  it("lists upcoming interviews soonest first, with Join only where a link is saved", async () => {
    await mount();
    const ids = [...document.querySelectorAll("tr[data-interview]")].map((r) => r.getAttribute("data-interview"));
    expect(ids).toEqual(["1", "2"]);
    const join = within(rowOf(1)).getByRole("link", { name: /Join Senior Java Developer/ });
    expect(join.getAttribute("href")).toBe("https://meet.example.org/j/1");
    expect(join.getAttribute("target")).toBe("_blank");
    expect(join.getAttribute("rel")).toContain("noopener");
    const off = within(rowOf(2)).getByRole("button", { name: /Join Data Engineer/ });
    expect(off.getAttribute("aria-disabled")).toBe("true");
    expect(off.getAttribute("title")).toMatch(/No meeting link/);
  });

  it("sorts latest first when asked", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "latest" } });
    expect([...document.querySelectorAll("tr[data-interview]")].map((r) => r.getAttribute("data-interview"))).toEqual(["2", "1"]);
  });

  it("opens the side sheet and saves join details through the BFF", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /^View Senior Java Developer/ }));
    await flush();
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/interviews/1"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Meeting link"), { target: { value: "https://meet.example.org/new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await flush();
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("/interviews/1/detail");
    expect(JSON.parse(put.body!)).toMatchObject({ meetingUrl: "https://meet.example.org/new" });
  });

  it("refuses a non-https link before calling the API", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /^View Senior Java Developer/ }));
    await flush();
    fireEvent.change(screen.getByLabelText("Meeting link"), { target: { value: "http://x.example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toMatch(/https/);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("shows the API's refusal in words", async () => {
    writeStatus = 422;
    writeBody = { message: "prepNote: contains a Social Security number" };
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /^View Senior Java Developer/ }));
    await flush();
    fireEvent.change(screen.getByLabelText("Preparation notes"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toMatch(/Social Security/);
  });

  it("adds feedback for a completed interview with a POST", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Add feedback for Done Role" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Positive" }));
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Went well." } });
    fireEvent.click(screen.getByRole("button", { name: "Save feedback" }));
    await flush();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/interviews/9/feedback");
    expect(JSON.parse(post.body!)).toEqual({ outcome: "POSITIVE", summary: "Went well." });
  });

  it("shows recent feedback and honest empty states", async () => {
    await mount();
    expect(screen.getByText("Strong technical skills.")).toBeTruthy();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...page(), upcoming: [], feedback: [], pendingFeedback: [], calendar: [] }), { status: 200 })));
    await mount();
    expect(screen.getByText(/No upcoming interviews/)).toBeTruthy();
    expect(screen.getByText(/No feedback recorded yet/)).toBeTruthy();
  });

  it("navigates the calendar by month and by keyboard, highlighting today", async () => {
    await mount();
    const today = document.querySelector("[data-today]") as HTMLElement;
    expect(today).toBeTruthy();
    expect(today.getAttribute("data-state")).toBe("COMPLETED");
    const label = document.querySelector("[data-month]")!.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(document.querySelector("[data-month]")!.textContent).not.toBe(label);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(document.querySelector("[data-month]")!.textContent).toBe(label);
    fireEvent.keyDown(document.querySelector("[data-today]") as HTMLElement, { key: "PageDown" });
    expect(document.querySelector("[data-month]")!.textContent).not.toBe(label);
  });

  it("shows a picked day's interviews with a View button", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-today]") as HTMLElement);
    expect(within(document.querySelector("[data-day-list]") as HTMLElement).getByText("Done Role")).toBeTruthy();
  });

  it("shows an error state when the page fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await mount();
    expect(screen.getByText(/didn't load/i)).toBeTruthy();
  });
});
