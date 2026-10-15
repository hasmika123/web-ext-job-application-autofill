// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import NewResumeForConsultant from "./NewResumeForConsultant";

const CONSULTANTS = [
  { consultantId: 9, name: "Casey One", title: "Senior Engineer", hasAccount: true },
  { consultantId: 10, name: "Seatless Person", title: null, hasAccount: false },
];
const SOURCES = {
  consultantId: 9,
  name: "Casey One",
  profile: { itemCount: 5, roles: 3, schools: 2, skills: 14, headline: "Backend Engineer" },
  resumes: [{ id: 41, name: "Casey's own", kind: "BUILT", updatedAt: "2026-10-10T00:00:00Z" }],
};

let calls: { url: string; method: string; body: string | null }[] = [];
const respond = (status: number, json?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

beforeEach(() => {
  push.mockReset();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : null });
      if (url === "/api/orgs/2/mkt/resumes/consultants") return respond(200, CONSULTANTS);
      if (url === "/api/orgs/2/mkt/resumes/consultants/9/sources") return respond(200, SOURCES);
      if (url === "/api/resumes/builder-config") return respond(200, { templates: { default: "modern" } });
      if (url === "/api/orgs/2/mkt/resumes/consultants/9/built" && method === "POST") return respond(201, { orgResumeId: 5, resumeId: 77, consultantId: 9, detail: {} });
      return respond(404, {});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("New resume for a consultant: the picker, then the SAME chooser in act-for mode", () => {
  it("lists the assigned consultants (one without a sign-in can not be chosen), opens the chooser for the chosen one and creates through the act-for route", async () => {
    const onCreated = vi.fn();
    render(
      <ToastProvider>
        <NewResumeForConsultant orgId={2} onCreated={onCreated} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /New resume for/ }));
    const list = await screen.findByRole("list", { name: "Consultants" });
    const casey = within(list).getByText("Casey One").closest("button") as HTMLButtonElement;
    const seatless = within(list).getByText("Seatless Person").closest("button") as HTMLButtonElement;
    expect(casey.disabled).toBe(false);
    expect(seatless.disabled).toBe(true);
    expect(within(list).getByText(/could not approve/)).toBeTruthy();

    fireEvent.click(casey);
    // the chooser the personal app uses, speaking about Casey
    expect(await screen.findByText("Start Casey's resume from")).toBeTruthy();
    expect(screen.getByText("Casey's saved profile: 3 roles · 2 schools · 14 skills")).toBeTruthy();
    expect(screen.getByText("Start from one of Casey's 1 resume")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Start from scratch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create resume" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/orgs/2/mkt/resumes/consultants/9/built");
    expect(JSON.parse(post.body ?? "{}")).toMatchObject({ source: { kind: "scratch" } });
    // a marketer is told it waits for the consultant, and can jump into the editor
    expect(await screen.findByText("Resume created for Casey One")).toBeTruthy();
    expect(screen.getByText(/waits for their approval/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit it" }));
    expect(push).toHaveBeenCalledWith("/w/marketing/resumes/5");
    // nothing was ever submitted for anybody and no share link was asked for
    expect(calls.some((c) => /submit|share|access/.test(c.url))).toBe(false);
  });

  it("says so when there is nobody assigned", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith("/consultants") ? respond(200, []) : respond(200, {}))));
    render(
      <ToastProvider>
        <NewResumeForConsultant orgId={2} onCreated={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /New resume for/ }));
    expect(await screen.findByText("You have no assigned consultants yet.")).toBeTruthy();
  });
});
