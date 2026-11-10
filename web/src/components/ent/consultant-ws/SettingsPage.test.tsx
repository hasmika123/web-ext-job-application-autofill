// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: nav.replace }), usePathname: () => "/w/consultant/settings", useSearchParams: () => new URLSearchParams(nav.search) }));

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
  nav.search = "";
  nav.replace.mockClear();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
const mount = async (canViewFeatures = true) => {
  render(
    <ToastProvider>
      <SettingsPage orgId={2} canViewFeatures={canViewFeatures} />
    </ToastProvider>,
  );
  await flush();
};

describe("ConsultantSettingsPage", () => {
  it("has three link rows, the Privacy | Appearance | Plan & features tabs, and none of the removed cards", async () => {
    await mount();
    const root = document.querySelector("[data-consultant-settings]")!;
    expect(root.getAttribute("data-status")).toBe("ready");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Privacy", "Appearance", "Plan & features"]);
    expect(screen.getByRole("tab", { name: "Privacy" }).getAttribute("aria-selected")).toBe("true");
    const href = (k: string) => document.querySelector(`[data-settings-link="${k}"]`)!.getAttribute("href");
    expect(href("profile")).toBe("/w/consultant/profile");
    expect(href("notifications")).toBe("/me#notifications");
    expect(href("security")).toBe("/me#security");
    expect(document.querySelector("[data-stat-tile]")).toBeNull();
    expect(document.querySelector("[data-fact]")).toBeNull();
    expect(document.querySelector("[data-security-row]")).toBeNull();
    expect(document.querySelector("[data-tool]")).toBeNull();
    expect(document.querySelector("[data-quick]")).toBeNull();
    expect(screen.queryByText(/Quick Actions|Ask a question|Not available yet|Connected Tools|Recent Account Activity|Your marketing buddy/)).toBeNull();
  });

  it("?tab=appearance shows Theme, Language and Time zone with the English-only line", async () => {
    nav.search = "tab=appearance";
    await mount();
    expect(screen.getByRole("tab", { name: "Appearance" }).getAttribute("aria-selected")).toBe("true");
    for (const l of ["Theme", "Language", "Time zone"]) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.getByText(/English only for now/)).toBeTruthy();
    expect(screen.queryByText(/not translated yet/)).toBeNull();
  });

  it("?tab=features mounts the feature table; without features.view the tab is not drawn", async () => {
    nav.search = "tab=features";
    await mount();
    expect(screen.getByRole("tab", { name: "Plan & features" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("[data-consultant-features]")).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith("/me-workspace/features"))).toBe(true);
    cleanup();
    calls = [];
    await mount(false);
    expect(screen.queryByRole("tab", { name: "Plan & features" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Privacy" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("[data-consultant-features]")).toBeNull();
  });

  it("saves a privacy switch optimistically and offers Undo", async () => {
    await mount();
    const sw = screen.getByRole("switch", { name: /Analytics/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    current = view({ settings: { profileVisibility: "ORG_ONLY", shareProfileWithEmployers: false, showContactInformation: false, allowAnalytics: true, theme: "SYSTEM", language: "en-US", timezone: "UTC", isDefault: false } });
    await act(async () => void fireEvent.click(sw));
    await flush();
    expect(calls.at(-1)).toMatchObject({ method: "PUT", url: "/api/orgs/2/me-workspace/settings/privacy", body: { allowAnalytics: true } });
    expect(screen.getByRole("switch", { name: /Analytics/ }).getAttribute("aria-checked")).toBe("true");
    const undo = screen.getByRole("button", { name: "Undo" });
    current = view();
    await act(async () => void fireEvent.click(undo));
    await flush();
    expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { allowAnalytics: false } });
    expect(screen.getByRole("switch", { name: /Analytics/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("puts the old value back and says so when the API refuses", async () => {
    await mount();
    writeStatus = 422;
    writeBody = { error: "profileVisibility must be one of ORG_ONLY", code: "ORG_INVALID" };
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: /Show contact information/ })));
    await flush();
    expect(screen.getByRole("switch", { name: /Show contact information/ }).getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector("[data-settings-problem]")!.textContent).toContain("must be one of");
  });

  it("shows a failure state", async () => {
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await mount();
    expect(document.querySelector("[data-consultant-settings]")!.getAttribute("data-status")).toBe("failed");
  });
});
