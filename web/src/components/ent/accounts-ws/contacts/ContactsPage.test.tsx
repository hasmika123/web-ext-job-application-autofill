// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ContactRow } from "@/lib/ent/clients";
import ContactsPage from "./ContactsPage";
import { EMPTY, formOf, problems, toBody, toPatch, type Form } from "./ContactFormDialog";

type Call = { method: string; url: URL; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let contacts: ContactRow[];
let canManage: boolean;
let listStatus: number;

const contact = (id: number, name: string, client: string, over: Partial<ContactRow> = {}): ContactRow => ({
  id, name, title: "VP of Talent", email: `${name.toLowerCase().replace(/ /g, ".")}@alpha.example.com`, phone: null, notes: null, role: "HIRING_MANAGER", status: "ACTIVE",
  client: { id: id < 10 ? 10 : 20, name: client }, addedAt: "2026-10-01T10:00:00Z", ...over,
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  canManage = true;
  listStatus = 200;
  contacts = [
    contact(1, "Pat Contact", "Alpha Corp", { phone: "+1 512 555 0100", notes: "Prefers mornings." }),
    contact(2, "Ben Recruiter", "Alpha Corp", { title: "Recruiter", role: "RECRUITER" }),
    contact(11, "Gone Person", "Beta Health", { status: "LEFT" }),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, "http://web.test");
      const method = init?.method ?? "GET";
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ method, url: u, body, headers });
      if (u.pathname.endsWith("/requirements/summary")) {
        return reply(200, { open: 0, unassigned: 0, aging: 0, onHold: 0, contacts: 3, agingDays: 14, asOf: "", clientOptions: [{ id: 10, name: "Alpha Corp", contacts: [] }, { id: 20, name: "Beta Health", contacts: [] }], access: { canCreate: true, canEdit: true, canAssign: true } });
      }
      if (u.pathname.endsWith("/clients/summary")) return reply(200, { access: { canManage, canCreateRequirement: true } });
      if (method === "GET" && u.pathname.endsWith("/clients/contacts")) {
        if (listStatus !== 200) return reply(listStatus, { error: "x" });
        let list = contacts;
        const cid = u.searchParams.get("clientId");
        if (cid) list = list.filter((c) => String(c.client.id) === cid);
        const q = u.searchParams.get("q");
        if (q) list = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
        return reply(200, { items: list, page: 0, size: 10, total: list.length, hasNext: false });
      }
      if (method === "POST" || method === "PATCH") return reply(method === "POST" ? 201 : 200, {});
      return reply(404, {});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <ToastProvider>
      <ContactsPage orgId={2} orgName="Acme" firstName="Amara" hrefs={{}} />
    </ToastProvider>,
  );

describe("ContactsPage", () => {
  it("lists the people with their client, work e-mail, phone and note; a person who left is marked", async () => {
    mount();
    await screen.findByText("Pat Contact");
    const pat = document.querySelector('[data-contact-row="1"]') as HTMLElement;
    expect(within(pat).getByText("Alpha Corp")).toBeTruthy();
    expect(within(pat).getByText("pat.contact@alpha.example.com")).toBeTruthy();
    expect(within(pat).getByText("+1 512 555 0100")).toBeTruthy();
    expect(within(pat).getByText("Prefers mornings.")).toBeTruthy();
    expect(within(pat).getByText("VP of Talent · Hiring manager")).toBeTruthy();
    const gone = document.querySelector('[data-contact-row="11"]') as HTMLElement;
    expect(within(gone).getByText("Left")).toBeTruthy();
    expect(within(gone).getByRole("button", { name: "Gone Person is back at the client" })).toBeTruthy();
    expect(document.querySelectorAll("table")).toHaveLength(0);
  });

  it("searches after a pause and filters by client", async () => {
    mount();
    await screen.findByText("Pat Contact");
    fireEvent.change(screen.getByLabelText("Search contacts"), { target: { value: "ben" } });
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith("/clients/contacts") && c.url.searchParams.get("q") === "ben")).toBe(true));
    await waitFor(() => expect(document.querySelectorAll("[data-contact-row]")).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Search contacts"), { target: { value: "" } });
    await waitFor(() => expect(document.querySelectorAll("[data-contact-row]")).toHaveLength(3));
    fireEvent.click(screen.getByLabelText("Client"));
    fireEvent.click(await screen.findByRole("option", { name: "Beta Health" }));
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get("clientId") === "20")).toBe(true));
    await waitFor(() => expect(document.querySelectorAll("[data-contact-row]")).toHaveLength(1));
  });

  it("adds a contact with the phone and a note, with an Idempotency-Key, to the chosen client", async () => {
    mount();
    await screen.findByText("Pat Contact");
    fireEvent.click(await screen.findByRole("button", { name: /Add contact/ }));
    const dlg = within(await screen.findByRole("dialog"));
    fireEvent.click(dlg.getByLabelText("Client"));
    fireEvent.click(await screen.findByRole("option", { name: "Alpha Corp" }));
    fireEvent.change(dlg.getByPlaceholderText("Jennifer Wilson"), { target: { value: "New Person" } });
    fireEvent.change(dlg.getByPlaceholderText("jennifer@company.com"), { target: { value: "new@alpha.example.com" } });
    fireEvent.change(dlg.getByPlaceholderText("+1 512 555 0100"), { target: { value: "+1 512 555 0111" } });
    fireEvent.change(dlg.getByLabelText("Note"), { target: { value: "Decides on rates." } });
    fireEvent.click(document.querySelector("[data-contact-submit]") as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url.pathname).toBe("/api/orgs/2/clients/10/contacts");
    expect(post.body).toEqual({ name: "New Person", title: null, email: "new@alpha.example.com", phone: "+1 512 555 0111", notes: "Decides on rates.", role: null });
    expect(post.headers["idempotency-key"]).toBeTruthy();
  });

  it("marks someone as left through the client's contact route", async () => {
    mount();
    await screen.findByText("Pat Contact");
    fireEvent.click(screen.getByRole("button", { name: "Mark Pat Contact as left" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url.pathname).toBe("/api/orgs/2/clients/10/contacts/1");
    expect(patch.body).toEqual({ status: "LEFT" });
  });

  it("edits only what changed", async () => {
    mount();
    await screen.findByText("Pat Contact");
    fireEvent.click(screen.getByRole("button", { name: "Edit Pat Contact" }));
    const dlg = within(await screen.findByRole("dialog"));
    fireEvent.change(dlg.getByPlaceholderText("+1 512 555 0100"), { target: { value: "+1 512 555 0199" } });
    fireEvent.click(document.querySelector("[data-contact-submit]") as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ phone: "+1 512 555 0199" });
  });

  it("a member who may not manage clients sees the people but no buttons", async () => {
    canManage = false;
    mount();
    await screen.findByText("Pat Contact");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Add contact/ })).toBeNull());
    expect(screen.queryByRole("button", { name: "Edit Pat Contact" })).toBeNull();
  });

  it("shows the empty, error and not-for-you states", async () => {
    contacts = [];
    mount();
    expect(await screen.findByText("No contacts yet")).toBeTruthy();
    cleanup();
    listStatus = 500;
    mount();
    expect(await screen.findByText(/didn't load/)).toBeTruthy();
    cleanup();
    listStatus = 404;
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });
});

describe("the contact form, pure parts", () => {
  const ok: Form = { ...EMPTY, clientId: "10", name: "Jo Doe" };

  it("needs a client (to add), a name, and checks the e-mail, phone and note", () => {
    expect(problems(ok, false)).toEqual({});
    expect(problems({ ...ok, clientId: "" }, false).clientId).toBeTruthy();
    expect(problems({ ...ok, clientId: "" }, true)).toEqual({});
    expect(problems({ ...ok, name: "J" }, false).name).toBeTruthy();
    expect(problems({ ...ok, email: "nope" }, false).email).toBeTruthy();
    expect(problems({ ...ok, phone: "12" }, false).phone).toBeTruthy();
    expect(problems({ ...ok, phone: "call me maybe" }, false).phone).toBeTruthy();
    expect(problems({ ...ok, phone: "+1 (512) 555-0100" }, false)).toEqual({});
    expect(problems({ ...ok, notes: "x".repeat(501) }, false).notes).toBeTruthy();
  });

  it("builds a body with nulls for blanks, and a patch of only what changed", () => {
    expect(toBody({ ...ok, title: " VP ", phone: " 5125550100 " })).toEqual({ name: "Jo Doe", title: "VP", email: null, phone: "5125550100", notes: null, role: null });
    const before = formOf(contact(1, "Pat Contact", "Alpha Corp", { phone: "+1 512 555 0100" }));
    expect(toPatch(before, before)).toEqual({});
    expect(toPatch({ ...before, phone: "", role: "RECRUITER" }, before)).toEqual({ phone: null, role: "RECRUITER" });
  });
});
