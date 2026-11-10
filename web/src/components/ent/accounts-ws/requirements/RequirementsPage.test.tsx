// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Candidate, ReqDetail, ReqRow, ReqSummary } from "@/lib/ent/accounts-ws/requirements";
import RequirementsPage from "./RequirementsPage";
import { EMPTY, formOf, problems, toCreateBody, toPatchBody, type Form } from "./RequirementDialog";

type Call = { method: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let rows: ReqRow[];
let access: { canCreate: boolean; canEdit: boolean; canAssign: boolean };
let override: ((c: Call) => { status: number; body?: unknown } | undefined) | null;
let assignees: Record<number, { consultantId: number; name: string; title: string | null; matchStatus: string; stage: string | null; assignedAt: string | null }[]>;

const row = (id: number, title: string, client: string, over: Partial<ReqRow> = {}): ReqRow => ({
  id, title, client: { id: id * 10, name: client }, location: "Austin, TX", workMode: "HYBRID", priority: "NORMAL", status: "OPEN", positions: 2, filled: 0,
  rate: { min: 70, max: 90, unit: "HOUR", currency: "USD" }, skills: ["Java", "Spring"], dueOn: null, postedAt: "2026-10-01T10:00:00Z", ageDays: 3, consultantCount: 0, source: "MANUAL", ...over,
});

const summary = (): ReqSummary => ({
  open: rows.filter((r) => r.status === "OPEN").length,
  unassigned: rows.filter((r) => r.status === "OPEN" && r.consultantCount === 0).length,
  aging: 1,
  onHold: rows.filter((r) => r.status === "ON_HOLD").length,
  contacts: 4,
  agingDays: 14,
  asOf: "2026-10-16T10:00:00Z",
  clientOptions: [
    { id: 10, name: "Alpha Corp", contacts: [{ id: 5, name: "Pat Contact" }] },
    { id: 20, name: "Beta Health", contacts: [] },
  ],
  access,
});

const detailOf = (r: ReqRow): ReqDetail => ({
  requirement: r, description: "We need a senior Java developer.", employment: "CONTRACT", durationLabel: "6 months", experienceLevel: "SENIOR", contact: null, jobUrl: null,
  assignees: assignees[r.id] ?? [], version: `"${r.id}"`, access,
});

const candidates: Candidate[] = [
  { consultantId: 1, name: "Jessica Davis", title: "Java Developer", availability: "AVAILABLE", score: 88, matchStatus: null, pausedReason: null },
  { consultantId: 2, name: "Noah Newcomer", title: "QA", availability: "AVAILABLE", score: null, matchStatus: null, pausedReason: null },
];

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function install() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, "http://web.test");
      const method = init?.method ?? "GET";
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      const call: Call = { method, path: u.pathname.replace(/^\/api\/orgs\/\d+\/requirements/, "") || "/", params: u.searchParams, body, headers };
      calls.push(call);
      const o = override?.(call);
      if (o) return reply(o.status, o.body ?? {});
      if (method === "GET" && call.path === "/") {
        let list = rows;
        const status = u.searchParams.get("status");
        if (status) list = list.filter((r) => r.status === status);
        if (u.searchParams.get("assigned") === "NONE") list = list.filter((r) => r.consultantCount === 0);
        return reply(200, { items: list, page: 0, size: 10, total: list.length, hasNext: false });
      }
      if (method === "GET" && call.path === "/summary") return reply(200, summary());
      const idm = /^\/(\d+)(\/candidates)?$/.exec(call.path);
      if (method === "GET" && idm && idm[2]) return reply(200, candidates);
      if (method === "GET" && idm) {
        const r = rows.find((x) => x.id === Number(idm[1]));
        return r ? reply(200, detailOf(r)) : reply(404, { error: "Not found." });
      }
      if (method === "POST" && call.path === "/") {
        const r = row(99, String(body?.title), "Alpha Corp", { source: String(body?.source ?? "MANUAL"), priority: (body?.priority as ReqRow["priority"]) ?? "NORMAL" });
        rows = [r, ...rows];
        return reply(201, detailOf(r));
      }
      const am = /^\/(\d+)\/assignments$/.exec(call.path);
      if (method === "POST" && am) {
        const r = rows.find((x) => x.id === Number(am[1]))!;
        assignees[r.id] = [{ consultantId: Number(body?.consultantId), name: "Jessica Davis", title: "Java Developer", matchStatus: "ASSIGNED", stage: null, assignedAt: "2026-10-16T10:00:00Z" }];
        r.consultantCount = 1;
        return reply(200, { requirement: detailOf(r), consultantId: Number(body?.consultantId), created: true, existing: false });
      }
      if (method === "PATCH" && idm) {
        const r = rows.find((x) => x.id === Number(idm[1]))!;
        Object.assign(r, body);
        return reply(200, detailOf(r));
      }
      return reply(404, { error: "Not found." });
    }),
  );
}

const mount = () =>
  render(
    <ToastProvider>
      <RequirementsPage orgId={2} orgName="Acme" firstName="Amara" hrefs={{}} />
    </ToastProvider>,
  );
const loaded = async () => {
  mount();
  await screen.findByText("Senior Frontend Engineer");
};

beforeEach(() => {
  calls = [];
  assignees = {};
  override = null;
  access = { canCreate: true, canEdit: true, canAssign: true };
  rows = [
    row(1, "Senior Frontend Engineer", "Alpha Corp", { priority: "HIGH", ageDays: 20, dueOn: "2026-12-31" }),
    row(2, "ML Engineer", "Alpha Corp", { consultantCount: 1 }),
    row(3, "Data Analyst", "Beta Health", { status: "ON_HOLD" }),
  ];
  install();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RequirementsPage", () => {
  it("draws the four tiles from the API's counts and one row per requirement", async () => {
    await loaded();
    const tile = (id: string) => document.querySelector(`[data-stat-tile="${id}"]`) as HTMLElement;
    expect(within(tile("open")).getByText("2")).toBeTruthy();
    expect(within(tile("unassigned")).getByText("1")).toBeTruthy();
    expect(tile("aging").textContent).toContain("Aging (14+ days)");
    expect(within(tile("onHold")).getByText("1")).toBeTruthy();
    expect(document.querySelectorAll("[data-requirement-row]")).toHaveLength(3);
    const first = document.querySelector('[data-requirement-row="1"]') as HTMLElement;
    expect(within(first).getByText("Alpha Corp")).toBeTruthy();
    expect(within(first).getByText("High")).toBeTruthy();
    expect(within(first).getByText("No consultant")).toBeTruthy();
    expect(within(first).getByText("By Dec 31, 2026")).toBeTruthy();
    expect(within(first).getByText("$70 - $90 / hour")).toBeTruthy();
  });

  it("is ONE list on every width: a card on a phone, a row on a desktop (no second copy of the data)", async () => {
    await loaded();
    expect(document.querySelectorAll("table")).toHaveLength(0);
    expect(screen.getAllByText("Senior Frontend Engineer")).toHaveLength(1);
  });

  it("a tile filters the list through the API", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Show requirements without a consultant" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/" && c.params.get("assigned") === "NONE" && c.params.get("status") === "OPEN")).toBe(true));
    await waitFor(() => expect(document.querySelectorAll("[data-requirement-row]")).toHaveLength(1));
    expect(screen.queryByText("ML Engineer")).toBeNull();
  });

  it("searches after a pause in typing, and not for one letter", async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText("Search requirements"), { target: { value: "m" } });
    await new Promise((r) => setTimeout(r, 450));
    expect(calls.filter((c) => c.path === "/" && c.params.get("q"))).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Search requirements"), { target: { value: "ml" } });
    await waitFor(() => expect(calls.some((c) => c.path === "/" && c.params.get("q") === "ml")).toBe(true));
  });

  it("opens the drawer with the facts, the client's text and who it was put in front of", async () => {
    assignees[2] = [{ consultantId: 9, name: "Jessica Davis", title: "Java Developer", matchStatus: "ASSIGNED", stage: null, assignedAt: null }];
    await loaded();
    fireEvent.click(document.querySelector('[data-requirement-row="2"]') as HTMLElement);
    const drawer = await screen.findByText("We need a senior Java developer.");
    expect(drawer).toBeTruthy();
    expect(screen.getByText("Jessica Davis")).toBeTruthy();
    expect(screen.getByText("Consultants it was put in front of (1)")).toBeTruthy();
  });

  it("puts a requirement in front of a consultant: records it, never applies for them", async () => {
    await loaded();
    fireEvent.click(document.querySelector('[data-requirement-row="1"]') as HTMLElement);
    await screen.findByText("We need a senior Java developer.");
    await waitFor(() => expect(screen.getByLabelText("Consultant to put this in front of")).toBeTruthy());
    expect(screen.getByText("The consultant sees it and decides. Nothing is applied or sent for them.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Consultant to put this in front of"));
    fireEvent.click(await screen.findByRole("option", { name: "Jessica Davis (88% fit)" }));
    fireEvent.click(screen.getByRole("button", { name: "Put in front of them" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/1/assignments" && c.body?.consultantId === 1)).toBe(true));
    await waitFor(() => expect(screen.getByText("Consultants it was put in front of (1)")).toBeTruthy());
  });

  it("moves the status from the drawer with the version it loaded", async () => {
    await loaded();
    fireEvent.click(document.querySelector('[data-requirement-row="1"]') as HTMLElement);
    await screen.findByText("We need a senior Java developer.");
    fireEvent.click(screen.getByLabelText("Move to status"));
    fireEvent.click(await screen.findByRole("option", { name: "On hold" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.path === "/1" && c.body?.status === "ON_HOLD" && c.headers["if-match"] === '"1"')).toBe(true));
  });

  it("enters a pasted client text with an Idempotency-Key and opens the new requirement", async () => {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Add requirement/ }));
    await screen.findByText("Enter what the client asked for. Consultants see it only when you put it in front of them, and they decide whether to apply.");
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("How did it arrive?"));
    fireEvent.click(await screen.findByRole("option", { name: "Pasted text" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByPlaceholderText("Senior Java Developer"), { target: { value: "Platform Engineer" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Client"));
    fireEvent.click(await screen.findByRole("option", { name: "Alpha Corp" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Description"), { target: { value: "Six month contract in Austin." } });
    fireEvent.click(document.querySelector("[data-requirement-submit]") as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/")).toBe(true));
    const post = calls.find((c) => c.method === "POST" && c.path === "/")!;
    expect(post.body).toMatchObject({ title: "Platform Engineer", clientId: 10, source: "PASTED_TEXT", description: "Six month contract in Austin.", priority: "NORMAL" });
    expect(post.headers["idempotency-key"]).toBeTruthy();
    expect(post.body).not.toHaveProperty("orgId");
    await waitFor(() => expect(document.querySelector('[data-requirement-drawer="99"]')).toBeTruthy());
  });

  it("explains a duplicate and offers the existing requirement", async () => {
    override = (c) => (c.method === "POST" && c.path === "/" ? { status: 409, body: { code: "REQUIREMENT_EXISTS", error: "dup", existingId: 2 } } : undefined);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Add requirement/ }));
    await screen.findByText("Enter what the client asked for. Consultants see it only when you put it in front of them, and they decide whether to apply.");
    fireEvent.change(within(screen.getByRole("dialog")).getByPlaceholderText("Senior Java Developer"), { target: { value: "ML Engineer" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Client"));
    fireEvent.click(await screen.findByRole("option", { name: "Alpha Corp" }));
    fireEvent.click(document.querySelector("[data-requirement-submit]") as HTMLElement);
    const err = await screen.findByText(/already has an open requirement like this one/);
    expect(err).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open it" }));
    await waitFor(() => expect(document.querySelector('[data-requirement-drawer="2"]')).toBeTruthy());
  });

  it("shows the sensitive-data refusal in words", async () => {
    override = (c) => (c.method === "POST" && c.path === "/" ? { status: 422, body: { code: "SENSITIVE_CONTENT", error: "x" } } : undefined);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Add requirement/ }));
    await screen.findByText("Enter what the client asked for. Consultants see it only when you put it in front of them, and they decide whether to apply.");
    fireEvent.change(within(screen.getByRole("dialog")).getByPlaceholderText("Senior Java Developer"), { target: { value: "Fine title" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Client"));
    fireEvent.click(await screen.findByRole("option", { name: "Alpha Corp" }));
    fireEvent.click(document.querySelector("[data-requirement-submit]") as HTMLElement);
    expect(await screen.findByText(/sensitive personal data/)).toBeTruthy();
  });

  it("a viewer sees no Add button, no status move and no assigning", async () => {
    access = { canCreate: false, canEdit: false, canAssign: false };
    await loaded();
    expect(screen.queryByRole("button", { name: /Add requirement/ })).toBeNull();
    fireEvent.click(document.querySelector('[data-requirement-row="1"]') as HTMLElement);
    await screen.findByText("We need a senior Java developer.");
    expect(screen.queryByLabelText("Move to status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Put in front of them" })).toBeNull();
  });
});

describe("RequirementsPage states", () => {
  it("the empty list invites the first requirement; a filtered empty list offers to clear", async () => {
    rows = [];
    mount();
    expect(await screen.findByText("No requirements yet")).toBeTruthy();
    expect(document.querySelectorAll("[data-requirement-row]")).toHaveLength(0);
    cleanup();
    rows = [row(1, "Only One", "Alpha Corp")];
    mount();
    await screen.findByText("Only One");
    fireEvent.click(screen.getByRole("button", { name: "Show requirements on hold" }));
    expect(await screen.findByText("No requirements match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Only One")).toBeTruthy();
  });

  it("shows a loading skeleton first, then an error with Try again when the list fails", async () => {
    override = (c) => (c.path === "/" && c.method === "GET" ? { status: 500, body: { error: "boom" } } : undefined);
    mount();
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(await screen.findByText(/didn't load/)).toBeTruthy();
    override = null;
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("Senior Frontend Engineer")).toBeTruthy();
  });

  it("a caller the API does not know gets 'isn't part of your role', not a hint", async () => {
    override = () => ({ status: 404, body: { code: "NOT_FOUND" } });
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });
});

describe("the intake form, pure parts", () => {
  const ok: Form = { ...EMPTY, title: "Senior Java Developer", clientId: "10" };

  it("needs a title, a client, and the text or link its source promises", () => {
    expect(problems(ok)).toEqual({});
    expect(problems({ ...ok, title: "x" }).title).toBeTruthy();
    expect(problems({ ...ok, clientId: "" }).clientId).toBeTruthy();
    expect(problems({ ...ok, source: "PASTED_TEXT" }).description).toBeTruthy();
    expect(problems({ ...ok, source: "PASTED_TEXT", description: "Text" })).toEqual({});
    expect(problems({ ...ok, source: "LINK", sourceUrl: "javascript:alert(1)" }).sourceUrl).toBeTruthy();
    expect(problems({ ...ok, source: "LINK", sourceUrl: "https://boards.example.com/jobs/1" })).toEqual({});
  });

  it("checks the rate range and the openings", () => {
    expect(problems({ ...ok, rateMin: "100", rateMax: "50", rateUnit: "HOUR" }).rateMax).toBeTruthy();
    expect(problems({ ...ok, rateMin: "50" }).rateUnit).toBeTruthy();
    expect(problems({ ...ok, rateMin: "5.5", rateUnit: "HOUR" }).rateMin).toBeTruthy();
    expect(problems({ ...ok, positions: "0" }).positions).toBeTruthy();
    expect(problems({ ...ok, positions: "501" }).positions).toBeTruthy();
  });

  it("builds the intake body: only the fields the API knows, never an organization id", () => {
    const body = toCreateBody({ ...ok, source: "LINK", sourceUrl: " https://boards.example.com/jobs/1 ", priority: "URGENT", dueOn: "2026-12-31", rateMin: "70", rateMax: "90", rateUnit: "HOUR", skills: ["Java"], positions: "2" });
    expect(body).toMatchObject({ title: "Senior Java Developer", clientId: 10, source: "LINK", sourceUrl: "https://boards.example.com/jobs/1", priority: "URGENT", dueOn: "2026-12-31", rateMin: 70, rateMax: 90, rateUnit: "HOUR", positions: 2, status: "OPEN" });
    expect(Object.keys(body)).not.toContain("orgId");
    expect(toCreateBody({ ...ok, source: "MANUAL", sourceUrl: "https://ignored.example.com" }).sourceUrl).toBeNull();
  });

  it("an edit sends only what changed", () => {
    const r = row(7, "Platform Engineer", "Alpha Corp", { dueOn: "2026-12-31", priority: "HIGH" });
    const before = formOf(detailOf(r));
    expect(toPatchBody(before, before)).toEqual({});
    expect(toPatchBody({ ...before, priority: "URGENT", dueOn: "" }, before)).toEqual({ priority: "URGENT", dueOn: null });
    expect(toPatchBody({ ...before, skills: ["Go"], location: " Dallas, TX " }, before)).toEqual({ skills: ["Go"], location: "Dallas, TX" });
  });
});
