import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import * as respond from "@/app/api/admin/ai/respond";
import { badBody, forward, onlyFields, passthrough, readObject } from "./admin-proxy";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => serverApiFetch.mockReset());

describe("admin BFF proxy helpers", () => {
  it("passes a success through untouched, status included", async () => {
    const res = await passthrough(json(201, { id: 7 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 7 });
  });

  it("turns Spring's ProblemDetail into { error, code, ...extras } with the same status", async () => {
    const res = await passthrough(
      json(400, { type: "about:blank", title: "Bad Request", status: 400, detail: "Must be between 40 and 90.", instance: "/api/admin/settings/x", code: "SETTING_OUT_OF_BOUNDS", min: 40, max: 90 }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Must be between 40 and 90.", code: "SETTING_OUT_OF_BOUNDS", min: 40, max: 90 });
  });

  it("falls back to title, then message, then a generic line", async () => {
    expect(await (await passthrough(json(409, { title: "Conflict" }))).json()).toEqual({ error: "Conflict" });
    expect(await (await passthrough(json(500, { message: "boom" }))).json()).toEqual({ error: "boom" });
    expect(await (await passthrough(new Response("<html>", { status: 502 }))).json()).toEqual({ error: "The action failed." });
  });

  it("a 401 asks the admin to sign in again", async () => {
    const res = await passthrough(json(401, { title: "Unauthorized" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/sign in again/);
  });

  it("forward calls serverApiFetch with the path and init, and shapes the answer", async () => {
    serverApiFetch.mockResolvedValue(json(200, { ok: true }));
    const res = await forward("/api/admin/settings/x", { method: "PUT", body: "{}" });
    expect(serverApiFetch).toHaveBeenCalledWith("/api/admin/settings/x", { method: "PUT", body: "{}" });
    expect(await res.json()).toEqual({ ok: true });
  });

  it("forward turns a network failure into a 502 in the same shape", async () => {
    serverApiFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await forward("/api/admin/x");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Couldn't reach the server." });
  });

  it("readObject accepts a JSON object only", async () => {
    const req = (body: string) => new Request("http://w/x", { method: "POST", body });
    expect(await readObject(req('{"a":1}'))).toEqual({ a: 1 });
    expect(await readObject(req("[1]"))).toBeNull();
    expect(await readObject(req("7"))).toBeNull();
    expect(await readObject(req("not json"))).toBeNull();
  });

  it("onlyFields names the first stranger; badBody is a 400 { error }", async () => {
    expect(onlyFields({ value: 1, reason: "x" }, ["value", "reason"])).toBeNull();
    expect(onlyFields({ value: 1, role: "ADMIN" }, ["value", "reason"])).toBe("Unknown field: role.");
    const res = badBody("Send a JSON object.");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Send a JSON object." });
  });

  it("the AI routes' old import path still resolves to the same helpers", () => {
    expect(respond.forward).toBe(forward);
    expect(respond.passthrough).toBe(passthrough);
    expect(respond.readObject).toBe(readObject);
    expect(respond.onlyFields).toBe(onlyFields);
    expect(respond.badBody).toBe(badBody);
  });
});
