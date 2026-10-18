import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESKTOP, stubViewport } from "@/components/admin-v3/common/kit-test-utils";
import InvitePanel from "./InvitePanel";
import type { FormOptions } from "@/lib/ent/invitations";

const OPTIONS: FormOptions = { roles: [{ id: 13, key: "MEMBER", name: "Member", description: null }], departments: [], rolesAvailable: true, departmentsAvailable: true };
const GENERATED = "Zq7!hTn4-Wm2+Rp9"; // test value, not a credential

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let createReply: () => Response;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  stubViewport(DESKTOP);
  calls = [];
  createReply = () => json({ memberId: 9, email: "sam@example.test", mode: "ACCOUNT_CREATED", tempPassword: null, tempPasswordExpiresAt: "2026-10-21T10:00:00Z", roleIds: [13] });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : null });
      if (String(url).endsWith("/members/temp-password")) return json({ password: GENERATED });
      if (String(url).endsWith("/members/account")) return createReply();
      return json({ batchId: 1, invited: [{ memberId: 5, email: "x", name: null }], rows: [{ entry: "x", email: "x", status: "INVITED", reason: null, memberId: 5 }] });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillValid(email = "sam@example.test") {
  fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /^Role/ }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /Member/ }));
}

describe("InvitePanel: create account now (the default) and send invitation", () => {
  it("opens in 'Create account now' with a generated password in the field", async () => {
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={() => undefined} />);
    expect((screen.getByRole("radio", { name: /Create account now/ }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toBe(GENERATED));
    expect(screen.queryByLabelText(/Personal Message/)).toBeNull();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeTruthy();
  });

  it("creates the account with the password the form showed (or the admin's own) and shows it once in a copy dialog", async () => {
    const onSent = vi.fn();
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={onSent} />);
    await waitFor(() => expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toBe(GENERATED));
    await fillValid();
    fireEvent.change(screen.getByLabelText(/Temporary password/), { target: { value: "My-own-typed-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    const dialog = await screen.findByRole("dialog", { name: "Account created" });
    expect((within(dialog).getByTestId("temp-password") as HTMLInputElement).value).toBe("My-own-typed-1");
    expect(within(dialog).getByRole("alert").textContent).toMatch(/Shown once/);
    const create = calls.find((c) => c.url.endsWith("/members/account"))!;
    expect(create.body).toEqual({ email: "sam@example.test", password: "My-own-typed-1", roleIds: [13] });
    expect(calls.some((c) => c.url.endsWith("/invitations") && c.method === "POST")).toBe(false); // no invitation was sent
    expect(onSent).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "I have copied it" }));
    await waitFor(() => expect(screen.queryByTestId("temp-password")).toBeNull());
    expect(document.body.textContent).not.toContain("My-own-typed-1");
    expect((screen.getByLabelText(/Email Address/) as HTMLInputElement).value).toBe("");
  });

  it("shows the server-generated password when the server returns one", async () => {
    createReply = () => json({ memberId: 9, email: "sam@example.test", mode: "ACCOUNT_CREATED", tempPassword: "Server-made-9!", tempPasswordExpiresAt: null, roleIds: [13] });
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={() => undefined} />);
    await waitFor(() => expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toBe(GENERATED));
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(((await screen.findByTestId("temp-password")) as HTMLInputElement).value).toBe("Server-made-9!"); // the server returns it only when the form sent none
  });

  it("refuses a password that breaks the rule before calling the API", async () => {
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={() => undefined} />);
    await waitFor(() => expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toBe(GENERATED));
    await fillValid();
    fireEvent.change(screen.getByLabelText(/Temporary password/), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("At least 4 characters.")).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith("/members/account"))).toBe(false);
  });

  it("legacy organizations: an address the API cannot create is invited instead: no password dialog, and it says so", async () => {
    createReply = () => json({ memberId: 5, email: "sam@example.test", mode: "INVITED", tempPassword: null, tempPasswordExpiresAt: null, roleIds: [13] });
    const onSent = vi.fn();
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={onSent} />);
    await waitFor(() => expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toBe(GENERATED));
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText(/An invitation was sent to sam@example.test instead of a new account/)).toBeTruthy();
    expect(screen.queryByTestId("temp-password")).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("maps the API's refusals to the field they belong to", async () => {
    createReply = () => json({ code: "ALREADY_MEMBER", error: "x" }, 409);
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={() => undefined} />);
    await waitFor(() => expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toBe(GENERATED));
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Already a member of this organization.")).toBeTruthy();
    expect(screen.queryByTestId("temp-password")).toBeNull();
  });

  it("'Send invitation' is the unchanged invitation flow: no password field, a personal message, the invitation endpoint", async () => {
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: /Send invitation/ }));
    expect(screen.queryByLabelText(/Temporary password/)).toBeNull();
    expect(screen.getByLabelText(/Personal Message/)).toBeTruthy();
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: /Send Invitation/ }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/invitations") && c.method === "POST")).toBe(true));
    expect(calls.some((c) => c.url.endsWith("/members/account"))).toBe(false);
  });
});

describe("InvitePanel: optional Team and Manager (ADM-19)", () => {
  const WITH_PLACEMENT: FormOptions = { ...OPTIONS, teams: [{ id: 31, name: "Platform", parentGroupId: null }], managers: [{ memberId: 5, name: "Mira Manager" }] };

  it("offers no Team or Manager choice when the organization has neither", () => {
    render(<InvitePanel orgId={7} options={OPTIONS} onSent={() => undefined} />);
    expect(document.querySelector("[data-invite-placement]")).toBeNull();
  });

  it("Create account now sends the chosen team and manager (reports-to) to the API", async () => {
    render(<InvitePanel orgId={7} options={WITH_PLACEMENT} onSent={() => undefined} />);
    await waitFor(() => expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toBe(GENERATED));
    await fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    fireEvent.click(screen.getByRole("option", { name: "Platform" }));
    fireEvent.click(screen.getByRole("button", { name: "Manager" }));
    fireEvent.click(screen.getByRole("option", { name: "Mira Manager" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByRole("dialog", { name: "Account created" });
    expect(calls.find((c) => c.url.endsWith("/members/account"))!.body).toMatchObject({ teamGroupId: 31, managerMemberId: 5 });
  });

  it("Send invitation sends them too, and leaves them out when nothing was chosen", async () => {
    render(<InvitePanel orgId={7} options={WITH_PLACEMENT} onSent={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: /Send invitation/ }));
    await fillValid("lee@example.test");
    fireEvent.click(screen.getByRole("button", { name: /Send Invitation/ }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/invitations") && c.method === "POST")).toBe(true));
    const sent = calls.find((c) => c.url.endsWith("/invitations") && c.method === "POST")!.body!;
    expect(sent).not.toHaveProperty("teamGroupId");
    expect(sent).not.toHaveProperty("managerMemberId");
  });
});
