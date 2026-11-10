import { beforeEach, describe, expect, it, vi } from "vitest";

const hostHeaders = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const setAuthCookies = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-host", async (orig) => ({ ...(await orig<typeof import("@/lib/auth-host")>()), authHostHeaders: async () => hostHeaders.value }));
vi.mock("@/lib/auth", () => ({ setAuthCookies }));

import { GET as demoList } from "@/app/api/ent/demo/route";
import { POST } from "./route";

const post = (login: unknown) =>
  POST(new Request("http://acme.localhost:3200/api/auth/tenant-demo", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ login }) }));

beforeEach(() => {
  hostHeaders.value = {};
  setAuthCookies.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/auth/tenant-demo (X1.12)", () => {
  it("refuses a platform host without calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await post("demo-ent-acme-sarah");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a login outside the enterprise demo namespace", async () => {
    hostHeaders.value = { "X-Kiwiply-Host": "acme.localhost" };
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await post("demo")).status).toBe(400);
    expect((await post("demo-org")).status).toBe(400);
    expect((await post("../x")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the tenant host to the API, sets the session cookies and answers only { ok, landing }", async () => {
    hostHeaders.value = { "X-Kiwiply-Host": "acme.localhost", "X-Kiwiply-Host-Secret": "s" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ accessToken: "a", refreshToken: "r" }), { status: 200 }));
    const res = await post("demo-ent-acme-sarah");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, landing: "/" });
    expect(setAuthCookies).toHaveBeenCalledWith("a", "r");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Kiwiply-Host"]).toBe("acme.localhost");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/authenticate/demo");
  });

  it("maps the API's NOT_A_MEMBER, DEMO_DISABLED and unknown answers without setting a session", async () => {
    hostHeaders.value = { "X-Kiwiply-Host": "beta.localhost" };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ code: "NOT_A_MEMBER" }), { status: 403 }));
    const notMember = await post("demo-ent-acme-sarah");
    expect(notMember.status).toBe(403);
    expect((await notMember.json()).code).toBe("NOT_A_MEMBER");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ code: "DEMO_DISABLED" }), { status: 403 }));
    expect((await (await post("demo-ent-beta-bea")).json()).code).toBe("DEMO_DISABLED");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect((await post("demo-ent-acme-nobody")).status).toBe(404);
    expect(setAuthCookies).not.toHaveBeenCalled();
  });
});

describe("GET /api/ent/demo (X1.12)", () => {
  it("answers off on a platform host without calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const body = await (await demoList()).json();
    expect(body).toEqual({ enabled: false, org: null, accounts: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the API's list through the contract check on a tenant host, and reads a failure as off", async () => {
    hostHeaders.value = { "X-Kiwiply-Host": "acme.localhost" };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, org: "Acme Staffing", accounts: [{ login: "demo-ent-acme-sarah", name: "Sarah Chen", roles: ["Organization Admin"], status: "ACTIVE", canSignIn: true }] }), { status: 200 }));
    const on = await (await demoList()).json();
    expect(on.enabled).toBe(true);
    expect(on.accounts[0].name).toBe("Sarah Chen");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 500 }));
    expect((await (await demoList()).json()).enabled).toBe(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("down"));
    expect((await (await demoList()).json()).enabled).toBe(false);
  });
});
