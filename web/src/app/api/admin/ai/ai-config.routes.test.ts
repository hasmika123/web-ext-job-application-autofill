import { afterEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));

import { GET as getConfig } from "./config/route";
import { PATCH as patchGlobal } from "./config/global/route";
import { GET as getHistory } from "./config/history/route";
import { PATCH as patchProvider } from "./providers/[id]/route";
import { POST as testProvider } from "./providers/[id]/test/route";
import { PATCH as patchRoute, DELETE as deleteRoute } from "./routes/[task]/route";
import { PUT as putPrice, DELETE as deletePrice } from "./prices/[model]/route";
import { GET as getCalls } from "./calls/route";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const send = (method: string, body?: unknown) =>
  new Request("http://w/x", { method, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

afterEach(() => serverApiFetch.mockReset());

describe("admin AI BFF routes (I1.12): forward with serverApiFetch, shape errors", () => {
  it("GET config and calls forward the path (calls keeps only its known filters)", async () => {
    serverApiFetch.mockResolvedValue(json(200, { ok: 1 }));
    expect((await getConfig()).status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/ai/config");

    await getCalls(new Request("http://w/api/admin/ai/calls?hours=24&task=parse&provider=gemini&failed=true&limit=50&before=900&evil=1&task2=x"));
    const path = serverApiFetch.mock.calls[1][0];
    expect(path.startsWith("/api/admin/ai/calls?")).toBe(true);
    const q = new URLSearchParams(path.split("?")[1]);
    expect(Object.fromEntries(q)).toEqual({ hours: "24", limit: "50", before: "900", task: "parse", provider: "gemini", failed: "true" });

    await getCalls(new Request("http://w/api/admin/ai/calls?hours=abc&task=a b&failed=false"));
    expect(serverApiFetch.mock.calls[2][0]).toBe("/api/admin/ai/calls");
  });

  it("GET history forwards key and limit", async () => {
    serverApiFetch.mockResolvedValue(json(200, []));
    await getHistory(new Request("http://w/x?key=ai.route.parse.model&limit=20"));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/ai/config/history?key=ai.route.parse.model&limit=20");
  });

  it("PATCH global forwards enabled + reason and rejects other fields and types", async () => {
    serverApiFetch.mockResolvedValue(json(200, { enabled: { value: false } }));
    const ok = await patchGlobal(send("PATCH", { enabled: false, reason: "5xx spike" }));
    expect(ok.status).toBe(200);
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/admin/ai/config/global");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ enabled: false, reason: "5xx spike" });

    expect((await patchGlobal(send("PATCH", { enabled: "no" }))).status).toBe(400);
    expect((await patchGlobal(send("PATCH", { enabled: true, key: "x" }))).status).toBe(400);
    expect((await patchGlobal(send("PATCH", "not json"))).status).toBe(400);
    expect(serverApiFetch).toHaveBeenCalledTimes(1);
  });

  it("PATCH provider forwards the changed fields, url-encodes the id, validates shape only", async () => {
    serverApiFetch.mockResolvedValue(json(200, { id: "gemini" }));
    await patchProvider(send("PATCH", { timeoutMs: 999999999, models: ["a-b"], enabled: false, reason: "r", force: true }), params({ id: "gem ini" }));
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/admin/ai/providers/gem%20ini");
    // bounds are the API's job: a silly number is forwarded untouched
    expect(JSON.parse(init?.body as string)).toEqual({ timeoutMs: 999999999, models: ["a-b"], enabled: false, reason: "r", force: true });

    expect((await patchProvider(send("PATCH", { models: ["ok", 3] }), params({ id: "gemini" }))).status).toBe(400);
    expect((await patchProvider(send("PATCH", { apiKey: "secret" }), params({ id: "gemini" }))).status).toBe(400);
    expect(serverApiFetch).toHaveBeenCalledTimes(1);
  });

  it("POST test forwards an optional model and relays 200 / 409 / 429 with the API's detail and extras", async () => {
    serverApiFetch.mockResolvedValueOnce(json(200, { ok: true, model: "m", latencyMs: 412, inputTokens: 9, outputTokens: 1, costMicros: 4, error: null }));
    const ok = await testProvider(send("POST", {}), params({ id: "gemini" }));
    expect(ok.status).toBe(200);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/ai/providers/gemini/test");
    expect(await ok.json()).toMatchObject({ ok: true, latencyMs: 412 });

    serverApiFetch.mockResolvedValueOnce(json(409, { type: "x", title: "Conflict", status: 409, detail: "Gemini has no key.", code: "AI_PROVIDER_NOT_CONFIGURED", provider: "gemini", keyEnvVar: "DOSSIER_AI_API_KEY" }));
    const missing = await testProvider(send("POST"), params({ id: "gemini" }));
    expect(missing.status).toBe(409);
    expect(await missing.json()).toEqual({ error: "Gemini has no key.", code: "AI_PROVIDER_NOT_CONFIGURED", provider: "gemini", keyEnvVar: "DOSSIER_AI_API_KEY" });

    serverApiFetch.mockResolvedValueOnce(json(429, { detail: "Slow down.", code: "AI_TEST_RATE_LIMITED", retryAfterSeconds: 120 }));
    const limited = await testProvider(send("POST", { model: "gemini-2.5-flash" }), params({ id: "gemini" }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "AI_TEST_RATE_LIMITED", retryAfterSeconds: 120 });

    expect((await testProvider(send("POST", { model: 7 }), params({ id: "gemini" }))).status).toBe(400);
  });

  it("PATCH / DELETE route forward by task and relay 400 detail and 409 in-use extras", async () => {
    serverApiFetch.mockResolvedValueOnce(json(200, { task: "parse" }));
    await patchRoute(send("PATCH", { model: "gemini-2.5-flash", maxOutputTokens: 4000, fallbackProvider: "none", fallbackModel: null }), params({ task: "parse" }));
    const [path, init] = serverApiFetch.mock.calls[0];
    expect(path).toBe("/api/admin/ai/routes/parse");
    expect(JSON.parse(init?.body as string)).toEqual({ model: "gemini-2.5-flash", maxOutputTokens: 4000, fallbackProvider: "none", fallbackModel: null });

    serverApiFetch.mockResolvedValueOnce(json(400, { detail: "Must be between 64 and 16384.", code: "AI_CONFIG_OUT_OF_BOUNDS", key: "k", min: 64, max: 16384 }));
    const bad = await patchRoute(send("PATCH", { maxOutputTokens: 5 }), params({ task: "parse" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Must be between 64 and 16384.", code: "AI_CONFIG_OUT_OF_BOUNDS", key: "k", min: 64, max: 16384 });

    expect((await patchRoute(send("PATCH", { maxOutputTokens: "lots" }), params({ task: "parse" }))).status).toBe(400);
    expect((await patchRoute(send("PATCH", { speed: 1 }), params({ task: "parse" }))).status).toBe(400);

    serverApiFetch.mockResolvedValueOnce(json(200, { task: "parse" }));
    await deleteRoute(send("DELETE"), params({ task: "parse" }));
    expect(serverApiFetch.mock.calls[2][0]).toBe("/api/admin/ai/routes/parse");
    expect(serverApiFetch.mock.calls[2][1]?.method).toBe("DELETE");
  });

  it("PUT / DELETE price url-encode the model (qwen3:8b) and need all three whole numbers", async () => {
    serverApiFetch.mockResolvedValue(json(200, { model: "qwen3:8b" }));
    await putPrice(send("PUT", { inputPerMtokMicros: 100000, cachedPerMtokMicros: 10000, outputPerMtokMicros: 400000 }), params({ model: "qwen3:8b" }));
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/admin/ai/prices/qwen3%3A8b");
    expect(serverApiFetch.mock.calls[0][1]?.method).toBe("PUT");

    expect((await putPrice(send("PUT", { inputPerMtokMicros: 1 }), params({ model: "m" }))).status).toBe(400);
    expect((await putPrice(send("PUT", { inputPerMtokMicros: 1.5, cachedPerMtokMicros: 1, outputPerMtokMicros: 1 }), params({ model: "m" }))).status).toBe(400);

    await deletePrice(send("DELETE"), params({ model: "qwen3:8b" }));
    expect(serverApiFetch.mock.calls[1][0]).toBe("/api/admin/ai/prices/qwen3%3A8b");
    expect(serverApiFetch.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("shapes 401 as a session message and an unreachable API as a 502", async () => {
    serverApiFetch.mockResolvedValueOnce(json(401, {}));
    const r401 = await getConfig();
    expect(r401.status).toBe(401);
    expect(await r401.json()).toEqual({ error: "Your session expired — please sign in again." });

    serverApiFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r502 = await getConfig();
    expect(r502.status).toBe(502);
    expect(await r502.json()).toEqual({ error: "Couldn't reach the server." });

    serverApiFetch.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const r500 = await getConfig();
    expect(r500.status).toBe(500);
    expect(await r500.json()).toEqual({ error: "The action failed." });

    serverApiFetch.mockResolvedValueOnce(json(403, { title: "Forbidden", status: 403 }));
    const r403 = await getConfig();
    expect(r403.status).toBe(403);
    expect(await r403.json()).toEqual({ error: "Forbidden" });
  });
});
