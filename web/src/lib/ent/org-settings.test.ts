import { afterEach, describe, expect, it, vi } from "vitest";
import { auditExportHref, fetchOrgSettings, parseSettings, saveSecurity } from "./org-settings";

const good = {
  general: { legalName: "Acme LLC", displayName: "Acme", timeZone: "UTC", locale: "en", contactEmail: null },
  security: { sessionTimeoutMinutes: 60, passwordMinLength: null, bounds: { sessionTimeoutMin: 15, sessionTimeoutMax: 100, passwordMinFloor: 4, passwordMinCeiling: 32 }, reasonMinChars: 10 },
  locales: ["en"],
};
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
afterEach(() => vi.unstubAllGlobals());

describe("org settings client", () => {
  it("parses a well-formed answer and refuses a malformed one", () => {
    expect(parseSettings(good)?.security.sessionTimeoutMinutes).toBe(60);
    expect(parseSettings(good)?.security.passwordMinLength).toBeNull();
    expect(parseSettings({ general: {}, security: {} })).toBeNull();
    expect(parseSettings(null)).toBeNull();
  });

  it("maps denied, invalid (with the API's message), demo and failed", async () => {
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchOrgSettings(3)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(422, { error: "passwordMinLength: must be between 4 and 32", field: "passwordMinLength" }));
    expect(await saveSecurity(3, { passwordMinLength: 99, reason: "because" })).toEqual({ kind: "INVALID", message: "passwordMinLength: must be between 4 and 32", field: "passwordMinLength" });
    vi.stubGlobal("fetch", reply(403, { code: "DEMO_READ_ONLY" }));
    expect(await saveSecurity(3, { reason: "x" })).toEqual({ kind: "DEMO" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await fetchOrgSettings(3)).toEqual({ kind: "FAILED" });
  });

  it("builds the audit CSV link from the page's filters with whole-day dates and no paging", () => {
    expect(auditExportHref(7, { action: "", from: "", to: "" })).toBe("/api/orgs/7/audit/export");
    const href = auditExportHref(7, { action: "MEMBER_INVITE", from: "2026-10-01", to: "2026-10-02" });
    expect(href.startsWith("/api/orgs/7/audit/export?action=MEMBER_INVITE&from=")).toBe(true);
    expect(href).toContain("&to=");
    expect(href).not.toContain("page=");
  });
});
