import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchResumePolicy, parsePolicy, saveConsultantShareLinks } from "./resume-policy";

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
afterEach(() => vi.unstubAllGlobals());

describe("resume policy client", () => {
  it("parses only a well-formed policy; the override flag defaults to false", () => {
    expect(parsePolicy({ consultantShareLinks: true, overridden: true })).toEqual({ consultantShareLinks: true, overridden: true });
    expect(parsePolicy({ consultantShareLinks: false })).toEqual({ consultantShareLinks: false, overridden: false });
    expect(parsePolicy({ consultantShareLinks: "yes" })).toBeNull();
    expect(parsePolicy(null)).toBeNull();
  });

  it("maps the API's answers: ok, denied (403/404), invalid (400/422), failed", async () => {
    vi.stubGlobal("fetch", reply(200, { consultantShareLinks: true, overridden: true }));
    expect(await fetchResumePolicy(3)).toEqual({ kind: "OK", policy: { consultantShareLinks: true, overridden: true } });
    vi.stubGlobal("fetch", reply(404, {}));
    expect(await fetchResumePolicy(3)).toEqual({ kind: "DENIED" });
    vi.stubGlobal("fetch", reply(422, { error: "must be true or false" }));
    expect(await saveConsultantShareLinks(3, true)).toEqual({ kind: "INVALID", message: "must be true or false" });
    vi.stubGlobal("fetch", reply(500, {}));
    expect(await saveConsultantShareLinks(3, true)).toEqual({ kind: "FAILED" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await fetchResumePolicy(3)).toEqual({ kind: "FAILED" });
  });

  it("writes exactly one boolean to the organization's own route", async () => {
    const f = reply(200, { consultantShareLinks: false, overridden: true });
    vi.stubGlobal("fetch", f);
    await saveConsultantShareLinks(9, false);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/9/resume-policy");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ consultantShareLinks: false });
  });
});
