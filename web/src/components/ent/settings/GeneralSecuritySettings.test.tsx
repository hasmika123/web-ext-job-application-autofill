// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import GeneralSecuritySettings from "./GeneralSecuritySettings";

let calls: { method: string; url: string; body: unknown }[];
let putStatus = 200;
let putBody: unknown = null;

const settings = (over: Record<string, unknown> = {}) => ({
  general: { legalName: "Acme Staffing LLC", displayName: "Acme Staffing", timeZone: "UTC", locale: "en", contactEmail: null },
  security: {
    sessionTimeoutMinutes: null,
    passwordMinLength: null,
    bounds: { sessionTimeoutMin: 15, sessionTimeoutMax: 43200, passwordMinFloor: 4, passwordMinCeiling: 32 },
    reasonMinChars: 10,
  },
  locales: ["en", "en-GB"],
  ...over,
});

beforeEach(() => {
  calls = [];
  putStatus = 200;
  putBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const status = method === "PUT" ? putStatus : 200;
      const body = method === "PUT" ? (putBody ?? settings()) : settings();
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
async function mount() {
  render(
    <ToastProvider>
      <GeneralSecuritySettings orgId={7} />
    </ToastProvider>,
  );
  await flush();
}

describe("Organization Settings: General", () => {
  it("reads its own organization's settings and shows the legal name read-only", async () => {
    await mount();
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/orgs/7/org-settings" });
    const legal = screen.getByDisplayValue("Acme Staffing LLC") as HTMLInputElement;
    expect(legal.readOnly || legal.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves the changed fields to the general route and tells the person", async () => {
    putBody = settings({ general: { legalName: "Acme Staffing LLC", displayName: "Acme Talent", timeZone: "UTC", locale: "en", contactEmail: "help@acme.example" } });
    await mount();
    fireEvent.change(screen.getByDisplayValue("Acme Staffing"), { target: { value: "Acme Talent" } });
    fireEvent.change(screen.getByPlaceholderText("support@yourcompany.com"), { target: { value: "help@acme.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await flush();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/orgs/7/org-settings/general");
    expect(put?.body).toMatchObject({ displayName: "Acme Talent", contactEmail: "help@acme.example", timeZone: "UTC", locale: "en" });
    expect(screen.getByText("General settings saved")).toBeTruthy();
  });

  it("shows the API's message when a value is refused", async () => {
    putStatus = 422;
    putBody = { error: "contactEmail: must be an email address" };
    await mount();
    fireEvent.change(screen.getByPlaceholderText("support@yourcompany.com"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await flush();
    expect(document.querySelector("[data-general-error]")?.textContent).toContain("must be an email address");
  });
});

describe("Organization Settings: Security", () => {
  it("needs a reason, checks the bounds, asks to confirm and then saves with the reason", async () => {
    await mount();
    const review = screen.getByRole("button", { name: "Review and save" }) as HTMLButtonElement;
    expect(review.disabled).toBe(true);
    const [timeoutInput, minInput] = screen.getAllByPlaceholderText("Platform default");
    fireEvent.change(minInput, { target: { value: "12" } });
    expect(review.disabled).toBe(true); // still no reason
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for the change/ }), { target: { value: "Customer security questionnaire" } });
    expect(review.disabled).toBe(false);

    fireEvent.change(timeoutInput, { target: { value: "5" } });
    fireEvent.click(review);
    expect(document.querySelector("[data-security-error]")?.textContent).toContain("between 15 and 43200");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    fireEvent.change(timeoutInput, { target: { value: "120" } });
    fireEvent.click(review);
    expect(document.querySelector("[data-confirm-security-copy]")?.textContent).toContain("120 minutes");
    expect(document.querySelector("[data-confirm-security-copy]")?.textContent).toContain("12 characters");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    fireEvent.click(document.querySelector("[data-confirm-security]") as HTMLElement);
    await flush();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/orgs/7/org-settings/security");
    expect(put?.body).toEqual({ sessionTimeoutMinutes: 120, passwordMinLength: 12, reason: "Customer security questionnaire" });
  });

  it("an empty field means the platform default (null on the wire)", async () => {
    putBody = settings({ security: { ...settings().security, passwordMinLength: 10 } });
    await mount();
    // start from a stored value, then clear it
    fireEvent.change(screen.getAllByPlaceholderText("Platform default")[1], { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for the change/ }), { target: { value: "Set a minimum first" } });
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    fireEvent.click(document.querySelector("[data-confirm-security]") as HTMLElement);
    await flush();
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ sessionTimeoutMinutes: null, passwordMinLength: 10 });
  });
});
