// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import JoinInvite from "./JoinInvite";
import type { JoinPreview } from "@/lib/ent/join";

afterEach(() => {
  cleanup();
  push.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

const preview = (over: Partial<JoinPreview> = {}): JoinPreview => ({
  source: "EMAIL",
  orgName: "Acme Staffing",
  orgSlug: "acme",
  role: "MEMBER",
  inviterName: "Olivia",
  open: true,
  consent: { version: "v3", defaultScope: "NONE", options: ["NONE", "SUMMARY"], text: "The full text." },
  roles: ["Consultant"],
  invitedEmailMasked: "s***@example.test",
  createsAccount: true,
  ...over,
});

const PW = "my-own-password";

function toConsent() {
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: PW } });
  fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: PW } });
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
}

describe("JoinInvite: an invitation that creates an account", () => {
  it("says it is a new organization account, separate from any personal account, and has no sign-in step", () => {
    render(<JoinInvite token="tok" name="Acme Staffing" preview={preview()} signedIn={false} />);
    expect(screen.getByText(/Olivia invited you to join Acme Staffing/)).toBeTruthy();
    expect(screen.getByText(/creates a new Acme Staffing account for you/).textContent).toMatch(/separate from any personal job-search account/);
    expect(screen.queryByText(/Sign in to continue/)).toBeNull();
    expect(screen.getByText("Consultant")).toBeTruthy();
  });

  it("password step: refuses a short or mismatched password without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinInvite token="tok" name="Acme Staffing" preview={preview()} signedIn={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least 4/);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: PW } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), { target: { value: "different-one" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/do not match/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("password -> consent -> accept sends the password and the chosen scope, then lands on the workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, signedIn: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinInvite token="tok/1" name="Acme Staffing" preview={preview()} signedIn={false} />);
    toConsent();
    expect(screen.getByText("What exactly?")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/A summary/));
    fireEvent.click(screen.getByRole("button", { name: /Create my account and join/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/join/tok%2F1/accept");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ shareScope: "SUMMARY", consentVersion: "v3", password: PW });
    expect(screen.getByRole("status").textContent).toMatch(/You're in/);
  });

  it("an accept without a session cookie (another host) sends the person to sign in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, signedIn: false }), { status: 200 })));
    render(<JoinInvite token="tok" name="Acme Staffing" preview={preview()} signedIn={false} />);
    toConsent();
    fireEvent.click(screen.getByRole("button", { name: /Create my account and join/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("shows the server's refusal and stays on the page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "This invitation has expired. Ask the person who invited you to send a new one." }), { status: 409 })));
    render(<JoinInvite token="tok" name="Acme Staffing" preview={preview()} signedIn={false} />);
    toConsent();
    fireEvent.click(screen.getByRole("button", { name: /Create my account and join/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/expired/);
    expect(push).not.toHaveBeenCalled();
  });

  it("an organization that is not open yet says so and offers no form", () => {
    render(<JoinInvite token="tok" name="Acme Staffing" preview={preview({ open: false })} signedIn={false} />);
    expect(screen.getByText(/not accepting new members yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
  });
});

describe("JoinInvite: a legacy (shared account) invitation keeps its behaviour", () => {
  it("signed out: asks to sign in first, with a same-host return-to; no password step", () => {
    render(<JoinInvite token="tok" name="Acme Staffing" preview={preview({ createsAccount: false })} signedIn={false} />);
    expect(screen.queryByText(/creates a new/)).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in to continue" }).getAttribute("href")).toBe("/login?next=%2Fjoin%2Ft%2Ftok");
  });

  it("signed in: goes straight to consent and sends no password", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, signedIn: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinInvite token="tok" name="Acme Staffing" preview={preview({ createsAccount: false })} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.queryByLabelText("Password")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Join/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ shareScope: "NONE", consentVersion: "v3" });
  });
});
