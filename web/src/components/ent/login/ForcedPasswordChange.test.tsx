import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import ForcedPasswordChange, { passwordProblem, PASSWORD_MIN } from "./ForcedPasswordChange";

afterEach(() => {
  cleanup();
  push.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("passwordProblem", () => {
  it("applies the platform rule and refuses reusing the temporary password", () => {
    expect(passwordProblem("", "abcd", "abcd")).toMatch(/temporary password/);
    expect(passwordProblem("tmp-pass", "a".repeat(PASSWORD_MIN - 1), "a".repeat(PASSWORD_MIN - 1))).toMatch(/at least/);
    expect(passwordProblem("tmp-pass", "x".repeat(101), "x".repeat(101))).toMatch(/at most/);
    expect(passwordProblem("tmp-pass", "tmp-pass", "tmp-pass")).toMatch(/different/);
    expect(passwordProblem("tmp-pass", "my-own-1", "my-own-2")).toMatch(/do not match/);
    expect(passwordProblem("tmp-pass", "my-own-1", "my-own-1")).toBeNull();
  });
});

function fill(current: string, next: string, again: string) {
  fireEvent.change(screen.getByLabelText("Temporary password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: again } });
}

describe("ForcedPasswordChange", () => {
  it("names the organization, offers no navigation and does not call the API for an invalid form", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ForcedPasswordChange name="Acme Staffing" />);
    expect(screen.getByText(/temporary password for Acme Staffing/)).toBeTruthy();
    // the only navigation is the organization's own policy links (same-host paths), nothing that leaves the page
    const navs = screen.queryAllByRole("navigation");
    expect(navs.every((n) => n.hasAttribute("data-policy-links"))).toBe(true);
    fill("tmp", "abc", "abc");
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least 4/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the change, then goes to the landing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ForcedPasswordChange name="Acme Staffing" />);
    fill("tmp-pass", "my-own-password", "my-own-password");
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/change-password");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ currentPassword: "tmp-pass", newPassword: "my-own-password" });
  });

  it("shows the server's refusal and stays on the page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "The current password is not right." }), { status: 400 })));
    render(<ForcedPasswordChange name="Acme Staffing" />);
    fill("wrong", "my-own-password", "my-own-password");
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));
    expect(await screen.findByText(/current password is not right/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("sends a lost session back to the sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    render(<ForcedPasswordChange name="Acme Staffing" />);
    fill("tmp-pass", "my-own-password", "my-own-password");
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});
