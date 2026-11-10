import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ChangeActor } from "@/lib/actors";
import type { ApplicationDetailData, TimelineEvent } from "@/lib/applications";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/board/ResumeFit", () => ({ default: () => <div data-testid="resume-fit" /> }));
vi.mock("@/components/board/ApplicationEmails", () => ({ default: () => <div data-testid="application-emails" /> }));

import ApplicationDetail from "./ApplicationDetail";

const HOUR = 3_600_000; // config-literal-ok: test fixture
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const ME = { id: 7, login: "anika" };

const you: ChangeActor = { userId: 7, label: "Anika Shah", kind: "PERSON" };
const sarah: ChangeActor = { userId: null, label: "Sarah Chen", kind: "PERSON", relation: "marketer" };
const ext: ChangeActor = { userId: null, label: "Kiwiply", kind: "EXTENSION" };
const mail: ChangeActor = { userId: null, label: "Kiwiply", kind: "MAIL" };

function event(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return { id: 3, kind: "STATUS", fromStatus: "APPLIED", toStatus: "INTERVIEW", source: "WEB", refId: null, summary: "Moved to Interview", createdAt: iso(-2 * HOUR), ...over };
}

function detail(updatedBy: ChangeActor | null, over: Partial<ApplicationDetailData> = {}): ApplicationDetailData {
  return {
    id: 1,
    company: "Stripe",
    roleTitle: "Designer",
    status: "INTERVIEW",
    createdAt: iso(-6 * 24 * HOUR),
    updatedAt: iso(-2 * HOUR),
    updatedBy,
    notesCount: 0,
    interviewsCount: 0,
    mailCount: 0,
    events: [event({ actor: updatedBy, actorKind: updatedBy?.kind ?? "PERSON" })],
    notes: [],
    interviews: [],
    suggestions: [],
    ...over,
  };
}

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;
const routes = new Map<string, Handler>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setPhone(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({ matches: on && q.includes("max-width"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => {
  routes.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const h = routes.get(`${init?.method ?? "GET"} ${url}`);
      return h ? h(init) : json({ message: "unrouted" }, 500);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(data: ApplicationDetailData, phone = false) {
  setPhone(phone);
  routes.set("GET /api/applications/1", () => json(data));
  render(
    <ToastProvider>
      <ApplicationDetail id={1} seed={data} isPro={false} me={ME} onClose={vi.fn()} onRow={vi.fn()} onStale={vi.fn()} />
    </ToastProvider>,
  );
}

const sheet = () => screen.getByRole("dialog");
const headerLine = () => sheet().querySelector("[data-updated-by]") as HTMLElement;
async function loaded() {
  await screen.findByText("Where does this stand?");
  await screen.findByRole("heading", { name: "Next step" });
}

describe("ApplicationDetail: Updated ... by ...", () => {
  it("the owner's own change reads 'by you', with the absolute time and who in the title", async () => {
    open(detail(you));
    await loaded();
    expect(headerLine().textContent).toMatch(/^Updated 2 hours ago by you$/);
    expect(headerLine().getAttribute("title")).toMatch(/ by you$/);
    expect(headerLine().getAttribute("title")).toMatch(/\d{4}/);
  });

  it("an act-for change reads the marketer's name with the MARKETER tag", async () => {
    open(detail(sarah));
    await loaded();
    expect(headerLine().textContent).toContain("Updated 2 hours ago by Sarah Chen");
    expect(within(headerLine()).getByText("MARKETER")).toBeTruthy();
  });

  it("submit-detect reads 'by the extension' and a mail move 'by Kiwiply from your email'", async () => {
    open(detail(ext));
    await loaded();
    expect(headerLine().textContent).toContain("by the extension");
    cleanup();
    open(detail(mail));
    await loaded();
    expect(headerLine().textContent).toContain("by Kiwiply from your email");
  });

  it("never prints an enterprise login, even if one were sent", async () => {
    open(detail({ userId: null, label: "ent#9#sarah@x.com", kind: "PERSON" }));
    await loaded();
    expect(sheet().textContent).not.toContain("ent#");
    expect(headerLine().textContent).toContain("by a member");
  });

  it("after the person's own change the line reads 'just now by you' before the refetch resolves", async () => {
    open(detail(sarah));
    await loaded();
    let release: (r: Response) => void = () => {};
    routes.set("PATCH /api/applications/1", () => new Promise<Response>((res) => (release = res)));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Offer" }));
    await waitFor(() => expect(headerLine().textContent).toMatch(/^Updated just now by you$/));
    release(json({ ...detail(you), status: "OFFER", updatedAt: new Date().toISOString() }));
    await waitFor(() => expect(headerLine().textContent).toMatch(/by you$/));
  });

  it("a refused change puts the previous 'Updated ... by ...' back", async () => {
    open(detail(sarah));
    await loaded();
    routes.set("PATCH /api/applications/1", () => json({ code: "TRACKER_INVALID", message: "nope" }, 422));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Offer" }));
    await screen.findByText("Couldn't change the status");
    expect(headerLine().textContent).toContain("by Sarah Chen");
  });

  it("on a phone the line is a button named 'Open timeline' that opens the Timeline tab", async () => {
    open(detail(sarah), true);
    await loaded();
    fireEvent.click(within(sheet()).getByRole("tab", { name: /^Notes/ }));
    const btn = within(sheet()).getByRole("button", { name: "Open timeline" });
    expect(btn.textContent).toContain("Sarah Chen");
    fireEvent.click(btn);
    expect(within(sheet()).getByRole("tab", { name: /^Timeline/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("on a desktop the line is plain text, not a button", async () => {
    open(detail(you));
    await loaded();
    expect(within(sheet()).queryByRole("button", { name: "Open timeline" })).toBeNull();
  });
});
