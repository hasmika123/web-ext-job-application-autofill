import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_BASE, GENERIC_FAILURE, UNREACHABLE, adminFetch, adminFetchIn, failFrom } from "./admin-client";

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown, raw?: string) {
  const f = vi.fn(async () => new Response(raw ?? JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("adminFetch", () => {
  it("calls /api/admin{path} and returns the parsed body", async () => {
    const f = stub(200, { key: "jobs.match_threshold", value: 70 });
    const res = await adminFetch<{ value: number }>("GET", "/settings?area=jobs");
    expect(res).toEqual({ ok: true, data: { key: "jobs.match_threshold", value: 70 } });
    expect(f).toHaveBeenCalledWith(`${ADMIN_BASE}/settings?area=jobs`, expect.objectContaining({ method: "GET", cache: "no-store", headers: undefined, body: undefined }));
  });

  it("sends a JSON body with a content type", async () => {
    const f = stub(200, {});
    await adminFetch("PUT", "/settings/jobs.match_threshold", { value: 70, reason: "tuning" });
    expect(f).toHaveBeenCalledWith(
      `${ADMIN_BASE}/settings/jobs.match_threshold`,
      expect.objectContaining({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: 70, reason: "tuning" }) }),
    );
  });

  it("maps a refusal to { status, code, error, extra } using the BFF's shape", async () => {
    stub(400, { error: "Must be between 40 and 90.", code: "SETTING_OUT_OF_BOUNDS", min: 40, max: 90 });
    const res = await adminFetch("PUT", "/settings/jobs.match_threshold", { value: 5 });
    expect(res).toEqual({ ok: false, status: 400, code: "SETTING_OUT_OF_BOUNDS", error: "Must be between 40 and 90.", extra: { min: 40, max: 90 } });
  });

  it("a refusal without text still says something, and a non-string code is null", async () => {
    stub(500, { code: 42 });
    const res = await adminFetch("GET", "/x");
    expect(res).toMatchObject({ ok: false, status: 500, code: null, error: GENERIC_FAILURE });
  });

  it("an answer that is not JSON counts as an empty object (a 204, an HTML error page)", async () => {
    stub(200, null, "");
    expect(await adminFetch("DELETE", "/x")).toEqual({ ok: true, data: {} });
    stub(502, null, "<html>bad gateway</html>");
    expect(await adminFetch("GET", "/x")).toMatchObject({ ok: false, status: 502, error: GENERIC_FAILURE });
  });

  it("a dead network is a status-0 failure, never a throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await adminFetch("GET", "/x")).toEqual({ ok: false, status: 0, code: null, error: UNREACHABLE, extra: {} });
  });
});

describe("adminFetchIn / failFrom", () => {
  it("binds a prefix", async () => {
    const f = stub(200, {});
    await adminFetchIn("/ai")("GET", "/config");
    expect(f.mock.calls[0]).toEqual(["/api/admin/ai/config", expect.anything()]);
  });

  it("failFrom keeps unknown fields as extras", () => {
    expect(failFrom(409, { error: "In use", code: "AI_PROVIDER_IN_USE", tasks: ["parse"] })).toEqual({
      ok: false,
      status: 409,
      code: "AI_PROVIDER_IN_USE",
      error: "In use",
      extra: { tasks: ["parse"] },
    });
  });
});
