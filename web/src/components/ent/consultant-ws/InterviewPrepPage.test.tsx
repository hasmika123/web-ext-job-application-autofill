// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/interview-prep" }));

import InterviewPrepPage from "./InterviewPrepPage";

const NOW = Date.now();
const tile = (value: number | null, over: Record<string, unknown> = {}) => ({ value, previous: null, delta: null, unit: "COUNT", sparkline: [], ...over });
const questions = (p: string) => [1, 2].map((i) => ({ id: `${p}-${i}`, text: `${p} question ${i}` }));

const page = (over: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: new Date(NOW).toISOString(),
  name: "Anika Rao",
  tiles: { upcoming: tile(3), score: tile(78, { unit: "POINTS", delta: 12, previous: 66 }), sets: tile(6), weak: tile(1) },
  modules: [
    { key: "question-bank", title: "Job-Specific Question Bank", description: "d", kind: "QUESTION_BANK", action: "PRACTICE", chips: ["Role-based"], chipsFromProfile: false, questions: questions("qb") },
    { key: "technical", title: "Technical Topics", description: "d", kind: "TECHNICAL", action: "PRACTICE", chips: ["Java", "Spring Boot"], chipsFromProfile: true, questions: questions("tech") },
    { key: "company", title: "Company Research", description: "d", kind: "COMPANY", action: "RESEARCH", chips: ["Company overview"], chipsFromProfile: false, questions: [] },
    { key: "behavioral", title: "Behavioral Questions", description: "d", kind: "BEHAVIORAL", action: "PRACTICE", chips: ["Leadership"], chipsFromProfile: false, questions: questions("beh") },
  ],
  history: [
    { id: 1, title: "Senior Java Developer - Tech Questions", kind: "TECHNICAL", score: 85, durationMinutes: 45, occurredAt: new Date(NOW - 86_400_000).toISOString(), hasNotes: true, answerCount: 2 },
    { id: 2, title: "Behavioral Interview Practice", kind: "BEHAVIORAL", score: 60, durationMinutes: 30, occurredAt: new Date(NOW - 2 * 86_400_000).toISOString(), hasNotes: false, answerCount: 0 },
  ],
  checklist: [
    { key: "review-jd", label: "Review job description and key requirements", checked: true, checkedAt: new Date(NOW).toISOString() },
    { key: "rest", label: "Get a good night's rest", checked: false, checkedAt: null },
  ],
  next: { interviewId: 9, scheduledAt: new Date(NOW + 86_400_000).toISOString(), role: "Senior Java Developer", company: "Acme", round: "Round 1" },
  weakKinds: ["BEHAVIORAL"],
  ...over,
});

type Call = { method: string; url: string; body?: string };
let calls: Call[];
let current: ReturnType<typeof page>;
let writeStatus = 200;
let writeBody: unknown = {};

const detail = {
  session: { id: 1, title: "Senior Java Developer - Tech Questions", kind: "TECHNICAL", score: 85, durationMinutes: 45, occurredAt: new Date(NOW).toISOString(), hasNotes: true, answerCount: 1 },
  notes: "Good on design.",
  answers: [{ position: 1, question: "tech question 1", score: 85 }],
};

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
      if (method === "POST") return json(writeStatus === 200 ? { ...detail, session: { ...detail.session, id: 3, title: "Saved one", score: 70 } } : writeBody, writeStatus);
      if (method === "PUT") return json(writeBody, writeStatus);
      if (/sessions\/\d+$/.test(url)) return json(detail);
      return json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = async () => {
  render(<InterviewPrepPage orgId={2} firstName="Anika Rao" />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
};

describe("InterviewPrepPage", () => {
  it("draws the tiles, modules, history and checklist from the API's numbers", async () => {
    await mount();
    expect(within(document.querySelector("[data-stat-tile='score']") as HTMLElement).getByText("78%")).toBeTruthy();
    expect(within(document.querySelector("[data-stat-tile='score']") as HTMLElement).getByText("+12 pts")).toBeTruthy();
    expect(document.querySelectorAll("[data-module]")).toHaveLength(4);
    expect(document.querySelector("[data-chips='profile']")?.textContent).toContain("Java");
    expect(screen.getByText("Senior Java Developer - Tech Questions")).toBeTruthy();
    expect(screen.getByText("Behavioral Interview Practice")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View Research/ }).getAttribute("href")).toBe("/w/consultant/interviews");
    expect(document.querySelector("[data-progress]")?.textContent).toBe("1/2");
  });

  it("shows honest empty values when there is nothing yet", async () => {
    current = page({ tiles: { upcoming: tile(0), score: tile(null, { unit: "POINTS" }), sets: tile(1), weak: tile(0) }, history: [], weakKinds: [], next: null });
    await mount();
    expect(within(document.querySelector("[data-stat-tile='score']") as HTMLElement).getByText("-")).toBeTruthy();
    expect(screen.getByText(/No practice sessions yet/)).toBeTruthy();
    expect(screen.getByText("Practice to find weak areas")).toBeTruthy();
  });

  it("Start Practice opens the self-score sheet, says there is no AI scoring yet and saves a real session", async () => {
    await mount();
    fireEvent.click(document.querySelector("#module-technical [data-action='practice']") as HTMLElement);
    expect(screen.getByText(/AI-scored practice with feedback arrives later/)).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save session" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "80" } });
    fireEvent.change(sliders[1], { target: { value: "60" } });
    expect(screen.getByText("Your score: 70%")).toBeTruthy();
    expect(save.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(save);
    });
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/me-workspace/interview-prep/sessions");
    const sent = JSON.parse(post.body!);
    expect(sent.moduleKey).toBe("technical");
    expect(sent.durationMinutes).toBeGreaterThanOrEqual(1);
    expect(sent.answers).toEqual([{ questionId: "tech-1", score: 80 }, { questionId: "tech-2", score: 60 }]);
    expect(screen.getByText(/Session saved: Saved one, 70%/)).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("a refused save keeps the sheet open and shows the API's message", async () => {
    writeStatus = 422;
    writeBody = { error: "notes: contains a social security number" };
    await mount();
    fireEvent.click(document.querySelector("#module-behavioral [data-action='practice']") as HTMLElement);
    fireEvent.change(screen.getAllByRole("slider")[0], { target: { value: "55" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save session" }));
    });
    expect(document.querySelector("[data-error]")?.textContent).toContain("social security");
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
  });

  it("Review Feedback shows the stored notes and question scores", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Review feedback for Senior Java Developer - Tech Questions" }));
    });
    expect(screen.getByText("Good on design.")).toBeTruthy();
    expect(screen.getByText("tech question 1")).toBeTruthy();
    expect(screen.getByText(/AI feedback on your answers arrives later/)).toBeTruthy();
  });

  it("ticking a checklist item updates at once, writes, and Undo reverses it", async () => {
    await mount();
    const rest = document.querySelector("[data-check='rest']") as HTMLElement;
    await act(async () => {
      fireEvent.click(rest);
    });
    expect(rest.getAttribute("aria-checked")).toBe("true");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/orgs/2/me-workspace/interview-prep/checklist/rest");
    expect(JSON.parse(put.body!)).toEqual({ checked: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    });
    expect(rest.getAttribute("aria-checked")).toBe("false");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2);
  });

  it("a failed checklist write rolls the tick back", async () => {
    writeStatus = 500;
    await mount();
    const rest = document.querySelector("[data-check='rest']") as HTMLElement;
    await act(async () => {
      fireEvent.click(rest);
    });
    expect(rest.getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector("[data-check-notice]")?.textContent).toMatch(/didn't save/);
  });

  it("Quick Actions link to the marketer page", async () => {
    await mount();
    expect(document.querySelector("[data-quick='schedule']")?.getAttribute("href")).toBe("/w/consultant/marketer");
    expect(document.querySelector("[data-quick='ask']")?.getAttribute("href")).toBe("/w/consultant/marketer");
  });
});
