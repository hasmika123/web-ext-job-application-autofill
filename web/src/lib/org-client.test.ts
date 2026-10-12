import { afterEach, describe, expect, it, vi } from "vitest";
import { orgCall, orgToAutosave } from "./org-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

function answer(res: Response | Error) {
  vi.stubGlobal("fetch", vi.fn(async () => (res instanceof Error ? Promise.reject(res) : res)));
}

describe("orgCall", () => {
  it("returns the data on success and a 204 as undefined", async () => {
    answer(json({ a: 1 }));
    expect(await orgCall("GET", "/x")).toEqual({ kind: "ok", data: { a: 1 } });
    answer(new Response(null, { status: 204 }));
    expect(await orgCall("POST", "/x", undefined, false)).toEqual({ kind: "ok", data: undefined });
  });

  it("keeps the code, the reason, the field and the extras, and uses the server's sentence, never the machine key", async () => {
    answer(json({ status: 409, code: "INVITE_EXPIRED", reason: "full", orgName: "Acme", title: "This link has no places left", message: "error.org" }, 409));
    const r = await orgCall("POST", "/x", {});
    expect(r).toMatchObject({ kind: "error", status: 409, code: "INVITE_EXPIRED", reason: "full", message: "This link has no places left", extra: { orgName: "Acme" } });
    answer(json({ code: "ORG_INVALID", field: "settings.defaultRole", title: "settings.defaultRole: must be MEMBER or STAFF", message: "error.org" }, 422));
    expect(await orgCall("PATCH", "/x", {})).toMatchObject({ status: 422, field: "settings.defaultRole", message: "settings.defaultRole: must be MEMBER or STAFF" });
  });

  it("answers a 404 with our words (the server's title is the generic one) and a 401 as an expired session", async () => {
    answer(json({ code: "NOT_FOUND", title: "Not Found", message: "error.org" }, 404));
    expect(await orgCall("GET", "/x")).toMatchObject({ status: 404, message: "That is no longer there." });
    answer(json({}, 401));
    expect(await orgCall("GET", "/x")).toMatchObject({ status: 401, message: expect.stringContaining("Sign in again") });
  });

  it("never throws: a network failure is status 0, an unreadable success is a 502", async () => {
    answer(new Error("offline"));
    expect(await orgCall("GET", "/x")).toMatchObject({ kind: "error", status: 0, message: expect.stringContaining("Couldn't reach the server") });
    answer(new Response("not json", { status: 200 }));
    expect(await orgCall("GET", "/x")).toMatchObject({ kind: "error", status: 502 });
  });
});

describe("orgToAutosave", () => {
  const err = (status: number, extra: object = {}) => ({ kind: "error" as const, status, message: "msg", extra: {}, ...extra });

  it("maps outcomes the way the autosave controller retries them", () => {
    expect(orgToAutosave({ kind: "ok", data: 1 })).toEqual({ kind: "ok" });
    expect(orgToAutosave(err(0))).toEqual({ kind: "network" });
    expect(orgToAutosave(err(429))).toEqual({ kind: "network" });
    expect(orgToAutosave(err(503))).toEqual({ kind: "network" });
    expect(orgToAutosave(err(422, { field: "website" }))).toEqual({ kind: "invalid", path: "website", message: "msg" });
    expect(orgToAutosave(err(409))).toEqual({ kind: "invalid", path: "", message: "msg" });
    expect(orgToAutosave(err(404))).toEqual({ kind: "fatal", message: "msg" });
  });
});
