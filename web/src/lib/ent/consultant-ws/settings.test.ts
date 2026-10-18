import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPrivacy,
  fetchSettings,
  inverseAppearance,
  inversePrivacy,
  levelOf,
  parseSettings,
  privacyTile,
  profileTile,
  rateText,
  saveAppearance,
  savePrivacy,
  timezoneOptions,
  toolsTile,
  whenText,
} from "./settings";

const body = (o: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: "2026-10-14T10:00:00Z",
  name: "Anika Rao",
  orgName: "ACME",
  account: { name: "Anika Rao", email: "anika@example.org", location: "Austin, TX" },
  tiles: { profileStatus: { percent: 64, complete: false }, privacy: { level: "PERSONAL", orgName: "ACME" }, connectedTools: { connected: 0, total: 4 } },
  careerPreferences: { employmentTypes: ["CONTRACT"], workMode: "Hybrid", targetRoles: ["Analyst"], locations: ["Austin, TX"], rateMinMinor: 8000, rateMaxMinor: 12000, availabilityStatus: "AVAILABLE" },
  settings: { profileVisibility: "ORG_ONLY", shareProfileWithEmployers: false, showContactInformation: false, allowAnalytics: false, theme: "SYSTEM", language: "en-US", timezone: "UTC", isDefault: true },
  tools: [{ key: "linkedin", name: "LinkedIn", state: "NOT_AVAILABLE" }],
  documents: { resumes: 2 },
  activity: [{ kind: "PRIVACY", label: "Privacy settings updated", detail: "Changed analytics usage", at: "2026-10-14T09:00:00Z" }, { nope: true }],
  languages: ["en-US", "fr-FR"],
  ...o,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseSettings", () => {
  it("reads the contract and drops rows that do not match", () => {
    const v = parseSettings(body())!;
    expect(v.settings.isDefault).toBe(true);
    expect(v.activity).toHaveLength(1);
    expect(v.tools[0].state).toBe("NOT_AVAILABLE");
    expect(v.documents.resumes).toBe(2);
    expect(v.career.rateMinMinor).toBe(8000);
  });
  it("is null for anything that is not the contract and never invents values", () => {
    expect(parseSettings(null)).toBeNull();
    expect(parseSettings({ orgId: 1 })).toBeNull();
    const v = parseSettings(body({ settings: { profileVisibility: "WORLD", theme: "NEON" } }))!;
    expect(v.settings.profileVisibility).toBe("ORG_ONLY");
    expect(v.settings.theme).toBe("SYSTEM");
    expect(v.settings.allowAnalytics).toBe(false);
  });
  it("never carries a phone, password or token", () => {
    const v = parseSettings(body({ account: { name: "A", phone: "555-0100", password: "x" } }))!;
    expect(JSON.stringify(v).toLowerCase()).not.toMatch(/phone|password|token|555/);
  });
});

describe("wording and helpers", () => {
  it("words the tiles from real values", () => {
    expect(profileTile({ percent: 64, complete: false })).toEqual({ value: "64%", sub: "profile completed" });
    expect(profileTile({ percent: 100, complete: true }).value).toBe("Complete");
    expect(privacyTile({ level: "PERSONAL", orgName: "ACME" }).sub).toBe("Visible to ACME only");
    expect(privacyTile({ level: "PRIVATE", orgName: "ACME" }).value).toBe("Private");
    expect(toolsTile({ connected: 0, total: 4 })).toBe("of 4 available tools");
  });
  it("derives the level like the API", () => {
    expect(levelOf({ profileVisibility: "ORG_ONLY", shareProfileWithEmployers: false })).toBe("PERSONAL");
    expect(levelOf({ profileVisibility: "ORG_ONLY", shareProfileWithEmployers: true })).toBe("SHARED");
    expect(levelOf({ profileVisibility: "APPROVED_EMPLOYERS", shareProfileWithEmployers: false })).toBe("SHARED");
    expect(levelOf({ profileVisibility: "PRIVATE", shareProfileWithEmployers: true })).toBe("PRIVATE");
  });
  it("formats rates, relative times and zones", () => {
    expect(rateText(8000, 12000)).toBe("$80 - $120");
    expect(rateText(null, null)).toBeNull();
    const now = Date.parse("2026-10-14T10:00:00Z");
    expect(whenText("2026-10-14T08:00:00Z", now)).toBe("2 hours ago");
    expect(whenText("2026-10-14T09:59:30Z", now)).toBe("Just now");
    expect(timezoneOptions("Asia/Kolkata")).toHaveLength(timezoneOptions("UTC").length);
    expect(timezoneOptions("Africa/Lagos")[0]).toBe("Africa/Lagos");
  });
  it("builds the inverse of a patch from the page before the change", () => {
    const s = parseSettings(body())!.settings;
    expect(inversePrivacy(s, { allowAnalytics: true })).toEqual({ allowAnalytics: false });
    expect(applyPrivacy(s, { allowAnalytics: true }).isDefault).toBe(false);
    expect(inverseAppearance(s, { theme: "DARK", timezone: "Asia/Tokyo" })).toEqual({ theme: "SYSTEM", timezone: "UTC" });
  });
});

describe("calls", () => {
  const stub = (status: number, json: unknown) => {
    const fn = vi.fn(async () => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fn);
    return fn;
  };
  it("reads the page", async () => {
    stub(200, body());
    expect((await fetchSettings(2)).kind).toBe("OK");
    stub(404, { error: "Not found." });
    expect((await fetchSettings(2)).kind).toBe("DENIED");
    stub(500, {});
    expect((await fetchSettings(2)).kind).toBe("FAILED");
  });
  it("sends only the changed fields and maps a refusal", async () => {
    const f = stub(200, body());
    expect((await savePrivacy(2, { allowAnalytics: true })).kind).toBe("OK");
    const call = (f.mock.calls as unknown as [string, RequestInit][])[0];
    expect(call[0]).toBe("/api/orgs/2/me-workspace/settings/privacy");
    expect(call[1].method).toBe("PUT");
    expect(JSON.parse(String(call[1].body))).toEqual({ allowAnalytics: true });
    stub(422, { error: "timezone must be an IANA time zone", code: "ORG_INVALID" });
    const r = await saveAppearance(2, { timezone: "Mars" });
    expect(r).toEqual({ kind: "INVALID", message: "timezone must be an IANA time zone" });
  });
});
