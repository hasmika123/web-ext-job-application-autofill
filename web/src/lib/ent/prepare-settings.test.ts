import { afterEach, describe, expect, it, vi } from "vitest";
import { PREPARE_EXPLAINER, fetchPrepareSettings, parsePrepareSettings, savePrepareSettings } from "./prepare-settings";

const limit = (value: number, platformMax: number, custom = false) => ({ value, platformMax, min: 1, custom });
const good = {
  platformEnabled: true,
  enabled: false,
  dailyCap: limit(30, 30),
  monthlyCap: limit(300, 300),
  maxBatch: limit(4, 10, true),
  licensed: { consultants: 2, total: 5, featureName: "Autopilot prepare" },
};
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
afterEach(() => vi.unstubAllGlobals());

describe("prepare settings client", () => {
  it("parses a well-formed answer and refuses a malformed one", () => {
    const s = parsePrepareSettings(good);
    expect(s?.enabled).toBe(false);
    expect(s?.maxBatch).toEqual({ value: 4, platformMax: 10, min: 1, custom: true });
    expect(s?.licensed).toEqual({ consultants: 2, total: 5, featureName: "Autopilot prepare" });
    expect(parsePrepareSettings({ ...good, dailyCap: {} })).toBeNull();
    expect(parsePrepareSettings({ ...good, enabled: "yes" })).toBeNull();
    expect(parsePrepareSettings(null)).toBeNull();
  });

  it("reads its own organization's route and maps denied and failed", async () => {
    const f = reply(200, good);
    vi.stubGlobal("fetch", f);
    expect((await fetchPrepareSettings(7)).kind).toBe("OK");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/orgs/7/org-settings/prepare");
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchPrepareSettings(7)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await fetchPrepareSettings(7)).toEqual({ kind: "FAILED" });
  });

  it("sends only the fields given, as a PUT, and maps the API's refusals", async () => {
    const f = reply(200, { ...good, enabled: true });
    vi.stubGlobal("fetch", f);
    const r = await savePrepareSettings(7, { enabled: true, dailyCap: null });
    expect(r.kind).toBe("OK");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/7/org-settings/prepare");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ enabled: true, dailyCap: null });

    vi.stubGlobal("fetch", reply(409, { code: "PREPARE_PLATFORM_OFF" }));
    expect(await savePrepareSettings(7, { enabled: true })).toEqual({ kind: "PLATFORM_OFF" });
    vi.stubGlobal("fetch", reply(422, { error: "dailyCap: must be at least 1", field: "dailyCap" }));
    expect(await savePrepareSettings(7, { dailyCap: 0 })).toEqual({ kind: "INVALID", message: "dailyCap: must be at least 1", field: "dailyCap" });
    vi.stubGlobal("fetch", reply(403, { code: "DEMO_READ_ONLY" }));
    expect(await savePrepareSettings(7, { enabled: true })).toEqual({ kind: "DEMO" });
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await savePrepareSettings(7, { enabled: true })).toEqual({ kind: "DENIED" });
  });

  it("says plainly that the consultant always reviews and submits and nothing is submitted for them", () => {
    expect(PREPARE_EXPLAINER).toContain("opens each one in its own tab");
    expect(PREPARE_EXPLAINER).toContain("review and press Submit themselves");
    expect(PREPARE_EXPLAINER).toContain("Nothing is ever submitted for them");
    expect(PREPARE_EXPLAINER).not.toMatch(/kiwiply/i);
  });
});
