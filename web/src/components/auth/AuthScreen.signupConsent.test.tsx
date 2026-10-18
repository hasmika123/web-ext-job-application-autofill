import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/signup" }));

import { ToastProvider } from "@kiwiply/ui";
import AuthScreen from "./AuthScreen";

const signup = () =>
  render(
    <ToastProvider>
      <AuthScreen mode="signup" />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("sign-up consent (T0.2)", () => {
  it("says that creating the account means agreeing, with links to the Terms and the Privacy Policy", () => {
    signup();
    const text = document.body.textContent ?? "";
    expect(text).toContain("By creating an account, you agree to our");
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });

  it("sends the sign-up to the one signup route (the API records the acceptance when it creates the account)", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ ok: true, needsActivation: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fn);
    signup();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jo Doe" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "jo@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account/ }));
    await waitFor(() => expect(fn).toHaveBeenCalled());
    const first = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(first[0]).toBe("/api/auth/signup");
    expect(await screen.findByText("Almost there")).toBeTruthy();
  });
});
