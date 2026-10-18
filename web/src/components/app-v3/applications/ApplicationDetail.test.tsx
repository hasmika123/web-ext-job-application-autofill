import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ApplicationDetailData } from "@/lib/applications";
import type { Interview } from "@/lib/interviews";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
// The legacy Pro cards fetch on their own; they are not under test here.
vi.mock("@/components/board/ResumeFit", () => ({ default: () => <div data-testid="resume-fit" /> }));
vi.mock("@/components/board/ApplicationEmails", () => ({ default: () => <div data-testid="application-emails" /> }));

import ApplicationDetail from "./ApplicationDetail";

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const HOUR = 3_600_000; // config-literal-ok: test fixture
const DAY = 24 * HOUR; // config-literal-ok: test fixture

function interview(over: Partial<Interview> = {}): Interview {
  return {
    id: 5,
    applicationId: 1,
    company: "Stripe",
    roleTitle: "Designer",
    kind: "VIDEO",
    startsAt: iso(2 * DAY),
    endsAt: null,
    tz: "UTC",
    location: "https://meet.example.com/x",
    interviewer: "Sam",
    notes: null,
    outcome: "PENDING",
    source: "WEB",
    createdAt: iso(-DAY),
    updatedAt: iso(-DAY),
    ...over,
  };
}

function detail(over: Partial<ApplicationDetailData> = {}): ApplicationDetailData {
  return {
    id: 1,
    company: "Stripe",
    roleTitle: "Designer",
    jobUrl: "https://stripe.example/jobs/1",
    location: "Remote",
    status: "APPLIED",
    appliedAt: iso(-5 * DAY),
    createdAt: iso(-6 * DAY),
    starred: false,
    archived: false,
    resume: { id: 3, label: "Priya - Designer" },
    jobDescription: "Design things.",
    nextAction: null,
    nextActionAt: null,
    nextStep: null,
    notesCount: 1,
    interviewsCount: 0,
    mailCount: 0,
    events: [
      { id: 3, kind: "STATUS", fromStatus: "DRAFT", toStatus: "APPLIED", source: "EXTENSION", refId: null, summary: "Applied", createdAt: iso(-2 * HOUR) },
      { id: 2, kind: "CREATED", fromStatus: null, toStatus: "DRAFT", source: "SYSTEM", refId: null, summary: "Added to your tracker", createdAt: iso(-6 * DAY) },
    ],
    notes: [{ id: 9, applicationId: 1, body: "Ask about the team.", pinned: false, createdAt: iso(-DAY), updatedAt: iso(-DAY) }],
    interviews: [],
    suggestions: [],
    ...over,
  };
}

type Handler = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;
const routes = new Map<string, Handler>();
const calls: { method: string; url: string; body: unknown }[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const h = routes.get(`${method} ${url}`);
      if (!h) return json({ message: `unrouted ${method} ${url}` }, 500);
      return h(init, url);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsTo = (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url);

const ME = { id: 7, login: "anika" };

function open(opts: { data?: ApplicationDetailData; me?: { id: number; login: string } | null } = {}) {
  const data = opts.data ?? detail();
  routes.set("GET /api/applications/1", () => json(data));
  const onRow = vi.fn();
  const onStale = vi.fn();
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <ApplicationDetail id={1} seed={data} isPro={false} me={opts.me === undefined ? ME : opts.me} onClose={onClose} onRow={onRow} onStale={onStale} />
    </ToastProvider>,
  );
  return { onRow, onStale, onClose };
}

const sheet = () => screen.getByRole("dialog");
async function loaded() {
  await screen.findByText("Where does this stand?");
  await screen.findByRole("heading", { name: "Next step" });
}

describe("ApplicationDetail: the sheet", () => {
  it("shows the status picker with every status, IN_REVIEW and WITHDRAWN included, and the timeline", async () => {
    open();
    await loaded();
    const picker = within(sheet()).getByRole("group", { name: "Application status" });
    for (const label of ["Saved", "Applied", "Under review", "Interview", "Offer", "Rejected", "Withdrawn"]) {
      expect(within(picker).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(within(picker).getByRole("button", { name: "Applied" }).getAttribute("aria-pressed")).toBe("true");
    const timeline = within(sheet()).getByRole("list", { name: "Timeline" });
    expect(within(timeline).getByText("Applied")).toBeTruthy();
    // An old payload names only the channel: the person's own extension save reads "by you via the extension".
    expect(within(timeline).getByText("by you via the extension")).toBeTruthy();
  });

  it("the five tabs, with the counts the server gave", async () => {
    open();
    await loaded();
    const tabs = within(sheet()).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Timeline", "Notes1", "Emails", "Resume", "Interview"]);
  });

  it("a status change is optimistic, hits PATCH, and offers Undo that puts it back", async () => {
    const { onRow, onStale } = open();
    routes.set("PATCH /api/applications/1", (init) => json({ ...detail(), status: JSON.parse(String(init?.body)).status }));
    await loaded();
    const picker = within(sheet()).getByRole("group", { name: "Application status" });
    fireEvent.click(within(picker).getByRole("button", { name: "Under review" }));
    expect(within(picker).getByRole("button", { name: "Under review" }).getAttribute("aria-pressed")).toBe("true");
    expect(onRow).toHaveBeenCalledWith(1, expect.objectContaining({ status: "IN_REVIEW" }));
    await waitFor(() => expect(callsTo("PATCH", "/api/applications/1")[0]?.body).toEqual({ status: "IN_REVIEW" }));
    const undo = await screen.findByRole("button", { name: "Undo" });
    expect(screen.getByText("Moved to Under review")).toBeTruthy();
    await waitFor(() => expect(onStale).toHaveBeenCalled());

    fireEvent.click(undo);
    await waitFor(() => expect(callsTo("PATCH", "/api/applications/1")[1]?.body).toEqual({ status: "APPLIED" }));
    await waitFor(() => expect(within(picker).getByRole("button", { name: "Applied" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("a refused change rolls back and says why", async () => {
    open();
    routes.set("PATCH /api/applications/1", () => json({ code: "TRACKER_INVALID", message: "status: nope" }, 422));
    await loaded();
    const picker = within(sheet()).getByRole("group", { name: "Application status" });
    fireEvent.click(within(picker).getByRole("button", { name: "Offer" }));
    await screen.findByText("Couldn't change the status");
    expect(within(picker).getByRole("button", { name: "Applied" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("an offer gets a celebration line and the 'Did you accept?' chips", async () => {
    open();
    routes.set("PATCH /api/applications/1", (init) => json({ ...detail(), status: JSON.parse(String(init?.body)).status, outcome: null }));
    await loaded();
    expect(screen.queryByText(/Did you accept/)).toBeNull();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Offer" }));
    expect(await screen.findByText(/An offer! Congrats/)).toBeTruthy();
    const accepted = await screen.findByRole("button", { name: "Yes, I accepted" });
    routes.set("PATCH /api/applications/1", () => json({ ...detail(), status: "OFFER", outcome: "ACCEPTED" }));
    fireEvent.click(accepted);
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ outcome: "ACCEPTED" }));
  });

  it("the next step autosaves, with no Save button", async () => {
    open();
    routes.set("PATCH /api/applications/1", () => json({ ...detail(), nextAction: "Send a thank-you note" }));
    await loaded();
    expect(screen.queryByRole("button", { name: /^save (changes|note|interview)$/i })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Send a thank-you note/), { target: { value: "Send a thank-you note" } });
    await waitFor(() => expect(callsTo("PATCH", "/api/applications/1")[0]?.body).toEqual({ nextAction: "Send a thank-you note" }), { timeout: 4000 });
  });

  it("archive acts at once and offers Undo", async () => {
    open();
    routes.set("PATCH /api/applications/1", (init) => json({ ...detail(), archived: JSON.parse(String(init?.body)).archived }));
    await loaded();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Archive" }));
    await screen.findByText("Application archived");
    expect(callsTo("PATCH", "/api/applications/1")[0]?.body).toEqual({ archived: true });
    expect(await within(sheet()).findByRole("button", { name: "Restore" })).toBeTruthy();
  });

  it("an application that is not there says so instead of a blank sheet", async () => {
    routes.set("GET /api/applications/1", () => json({}, 404));
    render(
      <ToastProvider>
        <ApplicationDetail id={1} seed={null} isPro={false} onClose={vi.fn()} onRow={vi.fn()} onStale={vi.fn()} />
      </ToastProvider>,
    );
    expect(await screen.findByText(/isn't here anymore/)).toBeTruthy();
  });
});

describe("ApplicationDetail: notes", () => {
  it("an existing note is its own autosaving box; typing PUTs the new text", async () => {
    open();
    routes.set("PUT /api/applications/1/notes/9", () => json({ id: 9, applicationId: 1, body: "Ask about the team and the pay band.", pinned: false, createdAt: iso(-DAY), updatedAt: iso(0) }));
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Notes/ }));
    const box = (await screen.findByDisplayValue("Ask about the team.")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Ask about the team and the pay band." } });
    await waitFor(() => expect(callsTo("PUT", "/api/applications/1/notes/9")[0]?.body).toEqual({ body: "Ask about the team and the pay band." }), { timeout: 4000 });
  });

  it("a new note is created the first time it has words, and later edits update that note", async () => {
    open({ data: detail({ notes: [], notesCount: 0 }) });
    routes.set("POST /api/applications/1/notes", (init) => json({ id: 11, applicationId: 1, body: JSON.parse(String(init?.body)).body, pinned: false, createdAt: iso(0), updatedAt: iso(0) }, 201));
    routes.set("PUT /api/applications/1/notes/11", () => json({ id: 11, applicationId: 1, body: "x", pinned: false, createdAt: iso(0), updatedAt: iso(0) }));
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Notes/ }));
    expect(await screen.findByText("No notes yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const box = (await screen.findByPlaceholderText("Write a note…")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Prep the portfolio story" } });
    await waitFor(() => expect(callsTo("POST", "/api/applications/1/notes")[0]?.body).toEqual({ body: "Prep the portfolio story", pinned: false }), { timeout: 4000 });
    fireEvent.change(box, { target: { value: "Prep the portfolio story, twice" } });
    await waitFor(() => expect(callsTo("PUT", "/api/applications/1/notes/11")[0]?.body).toEqual({ body: "Prep the portfolio story, twice" }), { timeout: 4000 });
    expect(callsTo("POST", "/api/applications/1/notes")).toHaveLength(1);
  });

  it("deleting a note offers Undo, which posts it again", async () => {
    open();
    routes.set("DELETE /api/applications/1/notes/9", () => new Response(null, { status: 204 }));
    routes.set("POST /api/applications/1/notes", () => json({ id: 12, applicationId: 1, body: "Ask about the team.", pinned: false, createdAt: iso(0), updatedAt: iso(0) }, 201));
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Notes/ }));
    await screen.findByDisplayValue("Ask about the team.");
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await screen.findByText("Note deleted");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(callsTo("POST", "/api/applications/1/notes")[0]?.body).toEqual({ body: "Ask about the team.", pinned: false }));
    expect(await screen.findByDisplayValue("Ask about the team.")).toBeTruthy();
  });
});

describe("ApplicationDetail: interviews", () => {
  it("the Interview tab lists each interview with an editable form and the calendar links", async () => {
    open({ data: detail({ status: "INTERVIEW", interviews: [interview()], interviewsCount: 1 }) });
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Interview/ }));
    const form = (await screen.findByText("Video call with Stripe")).closest("[data-interview-id]") as HTMLElement;
    expect(within(form).getByRole("link", { name: /Download \.ics/ }).getAttribute("href")).toBe("/api/interviews/5/ics");
    const g = within(form).getByRole("link", { name: /Google Calendar/ }).getAttribute("href") ?? "";
    expect(g).toContain("calendar.google.com/calendar/render");
    expect(g).toContain("Video+call+with+Stripe");
    // upcoming: no outcome question yet
    expect(within(form).queryByText("How did it go?")).toBeNull();
  });

  it("an interview that is over asks 'How did it go?' and one tap records it", async () => {
    open({ data: detail({ status: "INTERVIEW", interviews: [interview({ startsAt: iso(-2 * DAY) })], interviewsCount: 1 }) });
    routes.set("POST /api/applications/1/interviews/5/outcome", () => json(interview({ startsAt: iso(-2 * DAY), outcome: "PASSED" })));
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Interview/ }));
    expect(await screen.findByText("How did it go?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Went well" }));
    expect(screen.getByRole("button", { name: "Went well" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(callsTo("POST", "/api/applications/1/interviews/5/outcome")[0]?.body).toEqual({ outcome: "PASSED" }));
  });

  it("editing a field autosaves only that field through updateInterview", async () => {
    open({ data: detail({ status: "INTERVIEW", interviews: [interview()], interviewsCount: 1 }) });
    routes.set("PUT /api/applications/1/interviews/5", () => json(interview({ interviewer: "Alex" })));
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Interview/ }));
    const who = (await screen.findByDisplayValue("Sam")) as HTMLInputElement;
    fireEvent.change(who, { target: { value: "Alex" } });
    await waitFor(() => expect(callsTo("PUT", "/api/applications/1/interviews/5")[0]?.body).toEqual({ interviewer: "Alex" }), { timeout: 4000 });
  });

  it("Add interview creates one starting tomorrow", async () => {
    open();
    routes.set("POST /api/applications/1/interviews", () => json(interview({ id: 8 }), 201));
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Interview/ }));
    expect(await screen.findByText("No interviews yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add interview" }));
    await waitFor(() => expect(callsTo("POST", "/api/applications/1/interviews")).toHaveLength(1));
    const body = callsTo("POST", "/api/applications/1/interviews")[0].body as { kind: string; startsAt: string };
    expect(body.kind).toBe("VIDEO");
    expect(new Date(body.startsAt).getTime()).toBeGreaterThan(Date.now());
    expect(await screen.findByRole("link", { name: /Download \.ics/ })).toBeTruthy();
  });
});

describe("ApplicationDetail: emails and resume", () => {
  it("no mail yet points at connecting Gmail; mail mounts the inbox list", async () => {
    open();
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Emails/ }));
    expect((await screen.findByRole("link", { name: "Connect Gmail" })).getAttribute("href")).toBe("/settings/inbox");
    cleanup();
    open({ data: detail({ mailCount: 2 }) });
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Emails/ }));
    expect(await screen.findByTestId("application-emails")).toBeTruthy();
  });

  it("the Resume tab names the resume used and mounts the fit check", async () => {
    open();
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Resume/ }));
    expect(await screen.findByText("Priya - Designer")).toBeTruthy();
    expect(screen.getByTestId("resume-fit")).toBeTruthy();
  });
});
