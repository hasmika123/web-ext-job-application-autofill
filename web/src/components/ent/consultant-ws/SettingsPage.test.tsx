// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/settings" }));

import { ToastProvider } from "@kiwiply/ui";
import SettingsPage from "./SettingsPage";

let current: Record<string, unknown>;
let calls: { method: string; url: string; body: unknown }[];
let writeStatus = 200;
let writeBody: unknown = null;

const view = (o: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: "2026-10-14T10:00:00Z",
  name: "Anika Rao",
  orgName: "ACME",
  account: { name: "Anika Rao", email: "anika@example.org", location: "Austin, TX" },
  tiles: { profileStatus: { percent: 100, complete: true }, privacy: { level: "PERSONAL", orgName: "ACME" }, connectedTools: { connected: 0, total: 4 } },
  careerPreferences: { employmentTypes: ["CONTRACT", "CONTRACT_TO_HIRE"], workMode: "Hybrid", targetRoles: ["Business Analyst"], locations: ["Austin, TX"], rateMinMinor: 8000, rateMaxMinor: 12000, availabilityStatus: "AVAILABLE" },
  settings: { profileVisibility: "ORG_ONLY", shareProfileWithEmployers: false, showContactInformation: false, allowAnalytics: false, theme: "SYSTEM", language: "en-US", timezone: "UTC", isDefault: true },
  tools: [
    { key: "linkedin", name: "LinkedIn", state: "NOT_AVAILABLE" },
    { key: "google-drive", name: "Google Drive", state: "NOT_AVAILABLE" },
    { key: "github", name: "GitHub", state: "NOT_AVAILABLE" },
    { key: "dropbox", name: "Dropbox", state: "NOT_AVAILABLE" },
  ],
  documents: { resumes: 2 },
  activity: [{ kind: "PRIVACY", label: "Privacy settings updated", detail: "Changed analytics usage", at: "2026-10-14T09:00:00Z" }],
  languages: ["en-US", "en-GB", "es-ES", "fr-FR", "de-DE"],
  ...o,
});

beforeEach(() => {
  calls = [];
  current = view();
  writeStatus = 200;
  writeBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") return json(writeBody ?? current, writeStatus);
      return json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
const mount = async () => {
  render(
    <ToastProvider>
      <SettingsPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await flush();
};

describe("ConsultantSettingsPage", () => {
  it("shows the real tiles, account facts and a phone that is not collected", async () => {
    await mount();
    const root = document.querySelector("[data-consultant-settings]")!;
    expect(root.getAttribute("data-status")).toBe("ready");
    expect(within(screen.getByLabelText("Profile Status")).getByText("Complete")).toBeTruthy();
    expect(within(screen.getByLabelText("Privacy Level")).getByText("Visible to ACME only")).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>('[data-stat-tile="Connected Tools"]')!).getByText("of 4 available tools")).toBeTruthy();
    expect(document.querySelector('[data-fact="Full Name"]')!.textContent).toBe("Anika Rao");
    expect(document.querySelector('[data-fact="Email Address"]')!.textContent).toBe("anika@example.org");
    expect(document.querySelector('[data-fact="Phone Number"]')!.textContent).toBe("Not collected");
    expect(document.querySelector('[data-fact="Target Roles"]')!.textContent).toBe("Business Analyst");
    expect(document.querySelector("[data-resume-count]")!.textContent).toBe("2 resumes");
    expect(screen.getByText("Not collected", { selector: "span" })).toBeTruthy();
  });

  it("is honest about security and tools: no fake state, disabled connect buttons, a link to the account page", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Last changed|Enabled|Connected\b.*Last synced/);
    expect(document.querySelectorAll("[data-security-row]")).toHaveLength(3);
    expect(screen.getAllByText("Managed in your account settings")).toHaveLength(3);
    expect(document.querySelector("[data-security-link]")!.getAttribute("href")).toBe("/settings");
    const buttons = screen.getAllByRole("button", { name: /^Connect .* \(not available yet\)$/ });
    expect(buttons).toHaveLength(4);
    for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Not available yet")).toHaveLength(4);
    expect(document.querySelector('[data-quick="marketer"]')!.getAttribute("href")).toBe("/w/consultant/marketer");
    expect(document.querySelector('[data-quick="notifications"]')!.getAttribute("href")).toBe("/w/consultant/notifications");
    expect(document.querySelector('[data-quick="preferences"]')!.getAttribute("href")).toBe("/w/consultant/profile");
  });

  it("saves a privacy switch optimistically and offers Undo", async () => {
    await mount();
    const sw = screen.getByRole("switch", { name: /Allow Analytics Usage/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    current = view({ settings: { profileVisibility: "ORG_ONLY", shareProfileWithEmployers: false, showContactInformation: false, allowAnalytics: true, theme: "SYSTEM", language: "en-US", timezone: "UTC", isDefault: false } });
    await act(async () => void fireEvent.click(sw));
    await flush();
    expect(calls.at(-1)).toMatchObject({ method: "PUT", url: "/api/orgs/2/me-workspace/settings/privacy", body: { allowAnalytics: true } });
    expect(screen.getByRole("switch", { name: /Allow Analytics Usage/ }).getAttribute("aria-checked")).toBe("true");
    const undo = screen.getByRole("button", { name: "Undo" });
    current = view();
    await act(async () => void fireEvent.click(undo));
    await flush();
    expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { allowAnalytics: false } });
    expect(screen.getByRole("switch", { name: /Allow Analytics Usage/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("puts the old value back and says so when the API refuses", async () => {
    await mount();
    writeStatus = 422;
    writeBody = { error: "profileVisibility must be one of ORG_ONLY", code: "ORG_INVALID" };
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: /Show Contact Information/ })));
    await flush();
    expect(screen.getByRole("switch", { name: /Show Contact Information/ }).getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector("[data-settings-problem]")!.textContent).toContain("must be one of");
  });

  it("shows an honest empty state and a failure state", async () => {
    current = view({ activity: [] });
    await mount();
    expect(screen.getByText(/No activity yet/)).toBeTruthy();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await mount();
    expect(document.querySelector("[data-consultant-settings]")!.getAttribute("data-status")).toBe("failed");
  });
});
