// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TenantForgotPassword, TenantResetPassword } from "./TenantPasswordReset";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TenantForgotPassword", () => {
  it("says the account belongs to the organization and is separate from a personal Kiwiply account", () => {
    render(<TenantForgotPassword name="Acme Staffing" supportEmail="it@acme.test" />);
    expect(screen.getByText(/only changes your Acme Staffing account/).textContent).toMatch(/separate from any personal job-search account/);
    expect(screen.getByText("it@acme.test").getAttribute("href")).toBe("mailto:it@acme.test");
  });

  it("posts the address to the BFF and gives the same confirmation without saying whether an account exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TenantForgotPassword name="Acme Staffing" />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " sam@example.test " } });
    fireEvent.click(screen.getByRole("button", { name: /Send reset link/ }));
    const status = await screen.findByRole("status");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/forgot-password");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ email: "sam@example.test" });
    expect(status.textContent).toMatch(/If an account for sam@example.test exists at Acme Staffing/);
    expect(status.textContent).not.toMatch(/personal|Kiwiply/);
  });

  it("refuses a malformed address without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<TenantForgotPassword name="Acme" />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /Send reset link/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/email address/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TenantResetPassword", () => {
  it("a link without a key asks for a new one", () => {
    render(<TenantResetPassword name="Acme" resetKey="" />);
    expect(screen.getByText("Invalid reset link")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("checks the rule, sends the key and the new password, then points to the sign-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TenantResetPassword name="Acme" resetKey="k-1" />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /Save new password/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least 4/);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-1" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Save new password/ }));
    await waitFor(() => expect(screen.getByText("Password updated")).toBeTruthy());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ key: "k-1", newPassword: "new-password-1" });
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("shows the BFF's refusal for a dead key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "This reset link is invalid or has expired. Request a new one." }), { status: 400 })));
    render(<TenantResetPassword name="Acme" resetKey="dead" />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-1" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Save new password/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid or has expired/);
  });
});
