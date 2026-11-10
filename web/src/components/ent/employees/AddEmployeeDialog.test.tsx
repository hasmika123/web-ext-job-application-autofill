// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import AddEmployeeDialog from "./AddEmployeeDialog";

/** The Add employee dialog (it opens from the Employees page's header button): the invitation flow, the undo and the bulk sheet. */

type Call = { method: string; path: string; query: URLSearchParams; body: Record<string, unknown> | undefined };
let calls: Call[];
let invited: { id: number; email: string }[];
let inviteReply: (body: Record<string, unknown>) => { status: number; body: unknown };
let departments: { id: number; name: string }[];
const ROLES = [
  { id: 13, key: "MARKETING_SPECIALIST", name: "Marketing Specialist", description: null },
  { id: 14, key: "CONSULTANT", name: "Consultant", description: "Looks for work" },
];

function stubApi() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = new URL(url, "http://x");
      const call: Call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/api\/orgs\/\d+/, ""), query: u.searchParams, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
      if (call.path === "/invitations/form-options") return reply(200, { roles: ROLES, departments, rolesAvailable: true, departmentsAvailable: true });
      if (call.path === "/members/temp-password") return reply(200, { password: "Zq7!hTn4-Wm2+Rp9" });
      if (call.method === "POST" && call.path === "/invitations") return (({ status, body }) => reply(status, body))(inviteReply(call.body as Record<string, unknown>));
      if (call.method === "GET" && call.path === "/invitations") {
        const q = call.query.get("q") ?? "";
        const items = invited.filter((i) => i.email === q).map((i) => ({ id: i.id, email: i.email, name: null, status: "PENDING", roles: [], department: null, team: null, manager: null, invitedBy: null, invitedAt: "2026-10-10T09:00:00Z", expiresAt: null, acceptedAt: null, endedAt: null, resendCount: 0, message: null }));
        return reply(200, { items, page: 0, size: 5, total: items.length });
      }
      if (call.method === "POST" && /^\/invitations\/\d+\/revoke$/.test(call.path)) return reply(204, {});
      return reply(404, { error: "no stub" });
    }),
  );
}

function Harness({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(true);
  return <AddEmployeeDialog orgId={2} orgName="Acme" open={open} onClose={() => setOpen(false)} onChanged={onChanged} />;
}

const mount = (onChanged: () => void = () => undefined) =>
  render(
    <ToastProvider>
      <Harness onChanged={onChanged} />
    </ToastProvider>,
  );

const dialog = () => screen.getByRole("dialog", { name: "Add employee" });

async function fill(email: string) {
  const d = dialog();
  fireEvent.click(within(d).getByRole("radio", { name: /Send invitation/ })); // the dialog opens in "Create account now"; these tests are the invitation flow
  fireEvent.change(within(d).getByLabelText(/Email address/), { target: { value: email } });
  fireEvent.click(within(d).getByRole("button", { name: /^Role/ }));
  fireEvent.click(await within(d).findByRole("checkbox", { name: /Marketing Specialist/ }));
  fireEvent.click(within(d).getByRole("button", { name: "Department" }));
  fireEvent.click(await screen.findByRole("option", { name: "Marketing" }));
  return d;
}

beforeEach(() => {
  invited = [];
  departments = [{ id: 21, name: "Marketing" }, { id: 22, name: "Consulting" }];
  inviteReply = (b) => ({ status: 200, body: { batchId: 1, invited: [{ memberId: 9, email: (b.emails as string[])[0], name: null }], rows: (b.emails as string[]).map((e) => ({ entry: e, email: e, status: "INVITED", reason: null, memberId: 9 })) } });
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Add employee", () => {
  it("opens in 'Create account now' with the plain one-line explanation, and a Bulk invite link", async () => {
    mount();
    const d = dialog();
    expect((within(d).getByRole("radio", { name: /Create account now/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(d).getByText("Creates a separate account at Acme. It never links to any personal account they have.")).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Bulk invite" })).toBeTruthy();
    expect(within(d).queryByText(/Who they report to/)).toBeNull();
  });

  it("sends one invitation with the roles, department and message, closes, tells the page, and Undo revokes it", async () => {
    const onChanged = vi.fn();
    mount(onChanged);
    const d = await fill("new.person@acme.com");
    fireEvent.change(within(d).getByLabelText(/Full name/), { target: { value: "New Person" } });
    fireEvent.change(within(d).getByLabelText(/Personal message/), { target: { value: "Welcome aboard" } });
    expect(within(d).getByText("14/500")).toBeTruthy();
    inviteReply = (b) => {
      invited.push({ id: 50, email: "new.person@acme.com" });
      return { status: 200, body: { batchId: 1, invited: [{ memberId: 50, email: "new.person@acme.com", name: "New Person" }], rows: [{ entry: (b.emails as string[])[0], email: "new.person@acme.com", status: "INVITED", reason: null, memberId: 50 }] } };
    };
    fireEvent.click(within(d).getByRole("button", { name: /Send invitation/ }));
    await screen.findByText("Invite sent");
    const sent = calls.find((c) => c.method === "POST" && c.path === "/invitations")!.body;
    expect(sent).toEqual({ emails: ["new.person@acme.com"], roleIds: [13], fullName: "New Person", departmentGroupId: 21, message: "Welcome aboard" });
    expect(screen.queryByRole("dialog", { name: "Add employee" })).toBeNull();
    expect(onChanged).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/invitations/50/revoke")).toBe(true));
    await screen.findByText("Invitation cancelled");
  });

  it("does not send an incomplete form and says what is missing, field by field", async () => {
    mount();
    const d = dialog();
    fireEvent.click(within(d).getByRole("radio", { name: /Send invitation/ }));
    await waitFor(() => expect(within(d).getByRole("button", { name: "Department" }).textContent).toMatch(/Select a department/)); // the form options have arrived
    fireEvent.click(within(d).getByRole("button", { name: /Send invitation/ }));
    expect(await within(d).findByText("Enter the person's email address.")).toBeTruthy();
    expect(within(d).getByText("Pick at least one role.")).toBeTruthy();
    expect(within(d).getByText("Pick a department.")).toBeTruthy();
    fireEvent.change(within(d).getByLabelText(/Email address/), { target: { value: "not-an-email" } });
    fireEvent.click(within(d).getByRole("button", { name: /Send invitation/ }));
    expect(await within(d).findByText("That doesn't look like an email address.")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST" && c.path === "/invitations")).toBe(false);
  });

  it("shows the API's reason under the address (already a member) and keeps what was typed", async () => {
    mount();
    const d = await fill("sarah@acme.com");
    inviteReply = () => ({ status: 200, body: { batchId: 1, invited: [], rows: [{ entry: "sarah@acme.com", email: "sarah@acme.com", status: "ALREADY_MEMBER", reason: null, memberId: 1 }] } });
    fireEvent.click(within(d).getByRole("button", { name: /Send invitation/ }));
    expect(await within(d).findByText("Already a member of this organization.")).toBeTruthy();
    expect((within(d).getByLabelText(/Email address/) as HTMLInputElement).value).toBe("sarah@acme.com");
    expect(screen.queryByText("Invite sent")).toBeNull();
  });

  it("maps a role-ceiling refusal onto the role field", async () => {
    mount();
    const d = await fill("x.y@acme.com");
    inviteReply = () => ({ status: 422, body: { error: "too high", code: "ROLE_CEILING" } });
    fireEvent.click(within(d).getByRole("button", { name: /Send invitation/ }));
    expect(await within(d).findByText(/more access than you hold/)).toBeTruthy();
  });

  it("explains an organization without departments instead of blocking the form", async () => {
    departments = [];
    mount();
    const d = dialog();
    fireEvent.click(within(d).getByRole("radio", { name: /Send invitation/ }));
    await within(d).findByText(/No departments yet/);
    fireEvent.change(within(d).getByLabelText(/Email address/), { target: { value: "a@acme.com" } });
    fireEvent.click(within(d).getByRole("button", { name: /^Role/ }));
    fireEvent.click(await within(d).findByRole("checkbox", { name: /Consultant/ }));
    fireEvent.click(within(d).getByRole("button", { name: /Send invitation/ }));
    await screen.findByText("Invite sent");
    expect((calls.find((c) => c.method === "POST" && c.path === "/invitations")!.body as Record<string, unknown>).departmentGroupId).toBeUndefined();
  });

  it("Bulk invite: closes this dialog, opens the list sheet; one result row per entry, then 'fix the rest' keeps only what failed", async () => {
    mount();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Bulk invite" }));
    expect(screen.queryByRole("dialog", { name: "Add employee" })).toBeNull();
    const bulk = await screen.findByRole("dialog");
    fireEvent.change(within(bulk).getByLabelText(/Email addresses/), { target: { value: "good@acme.com, Bad Name <bad>\nsarah@acme.com" } });
    expect(within(bulk).getByText("3 addresses found")).toBeTruthy();
    fireEvent.click(within(bulk).getByRole("button", { name: /^Role/ }));
    fireEvent.click(await within(bulk).findByRole("checkbox", { name: /Consultant/ }));
    fireEvent.click(within(bulk).getByRole("button", { name: "Department" }));
    fireEvent.click(await screen.findByRole("option", { name: "Consulting" }));
    inviteReply = () => ({
      status: 200,
      body: {
        batchId: 1,
        invited: [{ memberId: 7, email: "good@acme.com", name: null }],
        rows: [
          { entry: "good@acme.com", email: "good@acme.com", status: "INVITED", reason: null, memberId: 7 },
          { entry: "Bad Name <bad>", email: null, status: "INVALID", reason: "malformed", memberId: null },
          { entry: "sarah@acme.com", email: "sarah@acme.com", status: "ALREADY_MEMBER", reason: null, memberId: 1 },
        ],
      },
    });
    fireEvent.click(within(bulk).getByRole("button", { name: /Send 3 invitations/ }));
    await within(bulk).findByText("1 invited, 2 not.");
    const result = within(bulk).getByRole("list", { name: "Result for each address" });
    expect(within(result).getByText("That doesn't look like an email address.")).toBeTruthy();
    expect(within(result).getByText("Already a member of this organization.")).toBeTruthy();
    fireEvent.click(within(bulk).getByRole("button", { name: /Fix the 2 that didn.t work/ }));
    expect((within(bulk).getByLabelText(/Email addresses/) as HTMLTextAreaElement).value).toBe("Bad Name <bad>\nsarah@acme.com");
  });
});
