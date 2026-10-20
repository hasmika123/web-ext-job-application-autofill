// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Activity, Invitation, InviteStatus } from "@/lib/ent/invitations";
import InvitationsPage from "./InvitationsPage";

const NOW = Date.now();
const DAY = 86_400_000;

function row(id: number, name: string, status: InviteStatus, over: Partial<Invitation> = {}): Invitation {
  const email = `${name.toLowerCase().replace(/ /g, ".")}@acme.com`;
  return {
    id,
    email,
    name,
    status,
    roles: [{ id: 13, key: "MARKETING_SPECIALIST", name: "Marketing Specialist", primary: true }],
    department: { id: 21, name: "Marketing" },
    team: null,
    manager: null,
    invitedBy: { memberId: 1, name: "Sarah Chen" },
    invitedAt: new Date(NOW - id * DAY).toISOString(),
    expiresAt: new Date(NOW + 10 * DAY).toISOString(),
    acceptedAt: null,
    endedAt: null,
    resendCount: 0,
    message: null,
    ...over,
  };
}

type Call = { method: string; path: string; query: URLSearchParams; body: unknown };
let calls: Call[];
let invitations: Invitation[];
let activity: Activity[];
let roles: { id: number; key: string; name: string; description: string | null }[];
let departments: { id: number; name: string }[];
let inviteReply: (body: Record<string, unknown>) => { status: number; body: unknown };

function stubApi() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = new URL(url, "http://x");
      const call: Call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/api\/orgs\/\d+\/invitations/, ""), query: u.searchParams, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
      if (call.method === "GET" && call.path === "") {
        const q = call.query;
        let rows = invitations.filter((i) => (!q.get("status") || i.status === q.get("status")) && (!q.get("q") || i.email.includes(q.get("q")!.toLowerCase()) || (i.name ?? "").toLowerCase().includes(q.get("q")!.toLowerCase())));
        rows = rows.sort((a, b) => Date.parse(b.invitedAt) - Date.parse(a.invitedAt));
        const size = Number(q.get("size") ?? 25);
        const page = Number(q.get("page") ?? 0);
        return reply(200, { items: rows.slice(page * size, page * size + size), page, size, total: rows.length });
      }
      if (call.path === "/counts") {
        const counts = (["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"] as const).map((s) => ({ status: s, count: invitations.filter((i) => i.status === s).length, deltaLastMonth: s === "PENDING" ? 3 : s === "REVOKED" ? -1 : 0 }));
        return reply(200, { counts, total: invitations.length });
      }
      if (call.path === "/activity") return reply(200, activity);
      if (call.path === "/form-options") return reply(200, { roles, departments, rolesAvailable: true, departmentsAvailable: true });
      if (call.method === "POST" && call.path === "") return (({ status, body }) => reply(status, body))(inviteReply(call.body as Record<string, unknown>));
      const one = /^\/(\d+)\/(resend|revoke)$/.exec(call.path);
      if (one && call.method === "POST") {
        const r = invitations.find((i) => i.id === Number(one[1]));
        if (!r) return reply(404, { error: "Not found." });
        if (one[2] === "revoke") {
          r.status = "REVOKED";
          return reply(204, {});
        }
        r.status = "PENDING";
        return reply(200, { memberId: r.id });
      }
      const bulk = /^\/bulk\/(resend|revoke)$/.exec(call.path);
      if (bulk) {
        const ids = (call.body as { ids: number[] }).ids;
        const results = ids.map((id) => {
          const r = invitations.find((i) => i.id === id);
          if (!r) return { id, status: "FAILED", code: "NOT_FOUND" };
          if (bulk[1] === "revoke") r.status = "REVOKED";
          return { id, status: "OK", code: null };
        });
        return reply(200, { results });
      }
      return reply(404, { error: "no stub" });
    }),
  );
}

function viewport({ phone = false, wide = true }: { phone?: boolean; wide?: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 767px") ? phone : query.includes("min-width: 1280px") ? wide : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function mount(props: Partial<React.ComponentProps<typeof InvitationsPage>> = {}) {
  return render(
    <ToastProvider>
      <InvitationsPage orgId={2} {...props} />
    </ToastProvider>,
  );
}

const table = () => screen.getByRole("table", { name: "Invitations" });
/** Waits for the list to load (the activity feed repeats names, so look inside the table or the card list). */
const ready = (name: string) => waitFor(() => expect(within(document.querySelector("table, ul[aria-label='Invitations']") as HTMLElement).getByText(name)).toBeTruthy());
const rowOf = (name: string) => within(table()).getByText(name).closest("tr") as HTMLElement;

beforeEach(() => {
  viewport({});
  invitations = [
    row(1, "Emily Carter", "PENDING"),
    row(2, "James Wilson", "ACCEPTED", { acceptedAt: new Date(NOW - DAY).toISOString() }),
    row(3, "Sophia Martinez", "PENDING", { roles: [{ id: 14, key: "CONSULTANT", name: "Consultant", primary: true }, { id: 13, key: "M", name: "Marketing Specialist", primary: false }] }),
    row(4, "Olivia Brown", "EXPIRED"),
    row(5, "Liam Johnson", "REVOKED"),
  ];
  activity = [
    { kind: "INVITED", at: new Date(NOW - 2 * 3600_000).toISOString(), invitationId: 1, email: "emily.carter@acme.com", name: "Emily Carter", actor: { memberId: 1, name: "Sarah Chen" } },
    { kind: "ACCEPTED", at: new Date(NOW - 4 * 3600_000).toISOString(), invitationId: 2, email: "james.wilson@acme.com", name: "James Wilson", actor: null },
    { kind: "REVOKED", at: new Date(NOW - 3 * DAY).toISOString(), invitationId: 5, email: "liam.johnson@acme.com", name: "Liam Johnson", actor: { memberId: 1, name: "Sarah Chen" } },
  ];
  roles = [
    { id: 13, key: "MARKETING_SPECIALIST", name: "Marketing Specialist", description: null },
    { id: 14, key: "CONSULTANT", name: "Consultant", description: "Looks for work" },
  ];
  departments = [{ id: 21, name: "Marketing" }, { id: 22, name: "Consulting" }];
  inviteReply = (b) => ({ status: 200, body: { batchId: 1, invited: [{ memberId: 9, email: (b.emails as string[])[0], name: null }], rows: (b.emails as string[]).map((e) => ({ entry: e, email: e, status: "INVITED", reason: null, memberId: 9 })) } });
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the list", () => {
  it("shows the rows with status chips, all from the API, and nothing else around the table", async () => {
    mount();
    await ready("Emily Carter");
    expect(within(rowOf("Emily Carter")).getByText("Pending")).toBeTruthy();
    expect(within(rowOf("James Wilson")).getByText("Accepted")).toBeTruthy();
    expect(within(rowOf("Olivia Brown")).getByText("Expired")).toBeTruthy();
    expect(within(rowOf("Liam Johnson")).getByText("Revoked")).toBeTruthy();
    expect(within(rowOf("Sophia Martinez")).getByText("+1")).toBeTruthy(); // a second role is a chip, not a column
    expect(screen.queryByRole("list", { name: "Invitation totals" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recent Invitation Activity" })).toBeNull();
    expect(screen.queryByText(/Need help with invitations/)).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Invite Employee" })).toBeNull();
  });

  it("reports the pending count for the tab label, and reloads when told something was added", async () => {
    const onPendingChange = vi.fn();
    const { rerender } = mount({ onPendingChange });
    await ready("Emily Carter");
    await waitFor(() => expect(onPendingChange).toHaveBeenCalledWith(2));
    const before = calls.filter((c) => c.method === "GET" && c.path === "").length;
    invitations.unshift(row(50, "New Person", "PENDING"));
    rerender(
      <ToastProvider>
        <InvitationsPage orgId={2} onPendingChange={onPendingChange} reloadSignal={1} />
      </ToastProvider>,
    );
    await ready("New Person");
    expect(calls.filter((c) => c.method === "GET" && c.path === "").length).toBeGreaterThan(before);
  });

  it("pages through the API, ten at a time", async () => {
    invitations = Array.from({ length: 23 }, (_, i) => row(i + 1, `Person ${String.fromCharCode(65 + (i % 26))}${i}`, "PENDING"));
    mount();
    await screen.findByText(/Showing 1–10 of 23/);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText(/Showing 11–20 of 23/);
    expect(calls.some((c) => c.path === "" && c.query.get("page") === "1" && c.query.get("size") === "10")).toBe(true);
    expect(screen.getByText(/Page 2 of 3/)).toBeTruthy();
  });

  it("filters by status and by search text, each asked of the server", async () => {
    mount();
    await ready("Emily Carter");
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(await screen.findByRole("option", { name: "Expired" }));
    await waitFor(() => expect(calls.some((c) => c.path === "" && c.query.get("status") === "EXPIRED")).toBe(true));
    await waitFor(() => expect(within(table()).queryByText("Emily Carter")).toBeNull());
    expect(within(table()).getByText("Olivia Brown")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await ready("Emily Carter");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search invitations" }), { target: { value: "sophia" } });
    await waitFor(() => expect(calls.some((c) => c.path === "" && c.query.get("q") === "sophia")).toBe(true));
    await waitFor(() => expect(within(table()).queryByText("Emily Carter")).toBeNull());
    expect(within(table()).getByText("Sophia Martinez")).toBeTruthy();
  });

  it("says when nothing matches the filters (not 'nothing yet')", async () => {
    mount();
    await ready("Emily Carter");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search invitations" }), { target: { value: "zzz" } });
    await screen.findByText("No invitations match");
  });

  it("shows an error with Retry when the list can't load", async () => {
    mount();
    await ready("Emily Carter");
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (String(url).includes("q=boom") ? ({ ok: false, status: 502, json: async () => ({ error: "Couldn't reach the server." }) } as Response) : real(url, init))));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search invitations" }), { target: { value: "boom" } });
    await screen.findByText(/Couldn.t reach the server/);
    expect(screen.getByRole("button", { name: /retry|try again/i })).toBeTruthy();
  });
});

describe("row actions with undo", () => {
  async function openMenu(name: string) {
    fireEvent.click(within(rowOf(name)).getByRole("button", { name: "Row actions" }));
  }

  it("revokes at once (the chip changes before the server answers) and Undo invites the same person again", async () => {
    mount();
    await ready("Emily Carter");
    await openMenu("Emily Carter");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Revoke/ }));
    await waitFor(() => expect(within(rowOf("Emily Carter")).getByText("Revoked")).toBeTruthy());
    expect(calls.some((c) => c.method === "POST" && c.path === "/1/revoke")).toBe(true);
    const toast = await screen.findByText("Invitation revoked");
    expect(toast).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "" && (c.body as { emails: string[] }).emails[0] === "emily.carter@acme.com")).toBe(true));
    const body = calls.find((c) => c.method === "POST" && c.path === "")!.body as { roleIds: number[]; departmentGroupId: number };
    expect(body.roleIds).toEqual([13]);
    expect(body.departmentGroupId).toBe(21);
  });

  it("puts the row back when the server refuses the revoke", async () => {
    mount();
    await ready("Emily Carter");
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (String(url).endsWith("/1/revoke") ? ({ ok: false, status: 404, json: async () => ({ error: "Not found." }) } as Response) : real(url, init))));
    await openMenu("Emily Carter");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Revoke/ }));
    await screen.findByText("Couldn't revoke");
    expect(within(rowOf("Emily Carter")).getByText("Pending")).toBeTruthy();
  });

  it("resends an expired invitation and shows it pending again", async () => {
    mount();
    await ready("Olivia Brown");
    await openMenu("Olivia Brown");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Resend/ }));
    await screen.findByText("Invitation sent again");
    expect(calls.some((c) => c.method === "POST" && c.path === "/4/resend")).toBe(true);
    await waitFor(() => expect(within(rowOf("Olivia Brown")).getByText("Pending")).toBeTruthy());
  });

  it("offers no action on an accepted invitation, and never a copy-link (the link is only ever emailed)", async () => {
    mount();
    await ready("James Wilson");
    await openMenu("James Wilson");
    expect((await screen.findByRole("menuitem", { name: /Already accepted/ })).getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByText(/copy.*link/i)).toBeNull();
  });
});

describe("the bulk bar", () => {
  it("appears with the count, resends the selection, and clears", async () => {
    mount();
    await ready("Emily Carter");
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Emily Carter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Olivia Brown" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("2 selected")).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: /Resend selected/ }));
    await screen.findByText("2 invitations resent.");
    expect(calls.find((c) => c.path === "/bulk/resend")?.body).toEqual({ ids: [1, 4] });
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
  });

  it("select-all picks the page; revoking asks for the word first and sends only pending ones", async () => {
    mount();
    await ready("Emily Carter");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all invitations on this page" }));
    expect(within(screen.getByRole("region", { name: "Bulk actions" })).getByText("5 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Revoke selected/ }));
    const confirm = await screen.findByRole("button", { name: "Revoke" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(calls.some((c) => c.path === "/bulk/revoke")).toBe(false);
    fireEvent.change(screen.getByLabelText(/Type revoke to confirm/i), { target: { value: "revoke" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    await screen.findByText("2 invitations revoked.");
    expect(calls.find((c) => c.path === "/bulk/revoke")?.body).toEqual({ ids: [1, 3] }); // the two pending rows
  });

  it("says which ones failed", async () => {
    mount();
    await ready("Emily Carter");
    const real = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        String(url).endsWith("/bulk/resend") ? ({ ok: true, status: 200, json: async () => ({ results: [{ id: 1, status: "OK", code: null }, { id: 3, status: "FAILED", code: "RESEND_LIMIT" }] }) } as Response) : real(url, init),
      ),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Emily Carter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Sophia Martinez" }));
    fireEvent.click(screen.getByRole("button", { name: /Resend selected/ }));
    await screen.findByText("1 invitation resent. 1 couldn't be resent.");
  });
});

describe("states", () => {
  it("offers 'Invite your first teammate' (which opens Add employee) when there are no invitations at all", async () => {
    invitations = [];
    activity = [];
    const onAdd = vi.fn();
    mount({ onAdd });
    await screen.findByText("No invitations yet");
    fireEvent.click(screen.getByRole("button", { name: /Invite your first teammate/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("hides the checkboxes and the row menus without the invite permission", async () => {
    mount({ canInvite: false });
    await ready("Emily Carter");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Row actions" })).toHaveLength(0);
  });

  it("on a phone the table becomes cards, with a checkbox beside the name", async () => {
    viewport({ phone: true, wide: false });
    mount();
    await ready("Emily Carter");
    expect(screen.queryByRole("table")).toBeNull();
    const cards = screen.getByRole("list", { name: "Invitations" });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(5);
    expect(within(cards).getByRole("checkbox", { name: "Select Emily Carter" })).toBeTruthy();
  });
});
