import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.hoisted(() => vi.fn());
const setAuthCookies = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ serverApiFetch }));
vi.mock("@/lib/auth", () => ({ setAuthCookies }));

import { POST } from "./route";

const ip = () => `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const post = (body: unknown, token = "tok-1") =>
  POST(new Request(`http://acme.localhost:3200/api/join/${token}/accept`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });

beforeEach(() => {
  serverApiFetch.mockReset();
  setAuthCookies.mockReset();
});

const OK = { shareScope: "SUMMARY", consentVersion: "v3", password: "my-own-password" };

describe("POST /api/join/{token}/accept", () => {
  it("forwards the password, writes the returned tenant session as cookies and never echoes a token", async () => {
    serverApiFetch.mockResolvedValue(Response.json({ orgId: 1, orgName: "Acme", session: { accessToken: "acc", refreshToken: "ref" } }));
    const res = await post(OK, "a b/c");
    const body = await res.json();
    expect(body).toEqual({ ok: true, signedIn: true, orgName: "Acme" });
    expect(JSON.stringify(body)).not.toMatch(/acc|ref|my-own-password/);
    expect(serverApiFetch.mock.calls[0][0]).toBe("/api/join/a%20b%2Fc/accept");
    expect(JSON.parse((serverApiFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual(OK);
    expect(setAuthCookies).toHaveBeenCalledWith("acc", "ref");
  });

  it("an answer without a session (not the organization's own host) sets no cookies", async () => {
    serverApiFetch.mockResolvedValue(Response.json({ orgId: 1, orgName: "Acme" }));
    expect(await (await post(OK)).json()).toEqual({ ok: true, signedIn: false, orgName: "Acme" });
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("a legacy accept sends no password key at all", async () => {
    serverApiFetch.mockResolvedValue(Response.json({ orgId: 1 }));
    await post({ shareScope: "NONE", consentVersion: "v3" });
    expect(JSON.parse((serverApiFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ shareScope: "NONE", consentVersion: "v3" });
  });

  it("maps the API's refusals to calm words and keeps the code", async () => {
    serverApiFetch.mockResolvedValueOnce(Response.json({ code: "INVITE_EXPIRED" }, { status: 409 }));
    const res = await post(OK);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "INVITE_EXPIRED", error: expect.stringMatching(/expired/) });
    serverApiFetch.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect((await post(OK)).status).toBe(404);
    serverApiFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect((await post(OK)).status).toBe(502);
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("rejects a missing consent choice or an unknown scope before calling the API, an unreachable API is a 502", async () => {
    expect((await post({ consentVersion: "v3" })).status).toBe(400);
    expect((await post({ shareScope: "FULL", consentVersion: "v3" })).status).toBe(400);
    expect((await post({ shareScope: "NONE" })).status).toBe(400);
    expect(serverApiFetch).not.toHaveBeenCalled();
    serverApiFetch.mockRejectedValueOnce(new Error("down"));
    expect((await post(OK)).status).toBe(502);
  });
});
