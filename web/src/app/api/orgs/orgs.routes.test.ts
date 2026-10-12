import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const cookieStore = { set: vi.fn() };
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));
vi.mock("@/lib/auth", () => ({ hasSession: async () => true }));
vi.mock("@/lib/public-config", () => ({ getPublicConfig: async () => ({ orgs: true, demo: false }) }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { GET as mineGET } from "./mine/route";
import { POST as currentPOST } from "./current/route";
import { GET as orgGET, PATCH as orgPATCH } from "./[orgId]/route";
import { GET as billingGET } from "./[orgId]/billing/route";
import { POST as activatePOST } from "./[orgId]/activate/route";
import { POST as createPOST } from "./route";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ctx = (orgId: string) => ({ params: Promise.resolve({ orgId }) });
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://web.test${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => serverApiFetch.mockImplementation(async () => json({ ok: true })));
afterEach(() => {
  serverApiFetch.mockReset();
  cookieStore.set.mockReset();
});

describe("GET /api/orgs/mine", () => {
  it("relays the memberships, uncached", async () => {
    serverApiFetch.mockResolvedValue(json([{ orgId: 1, name: "Acme", role: "OWNER" }]));
    const res = await mineGET();
    expect(await res.json()).toEqual([{ orgId: 1, name: "Acme", role: "OWNER" }]);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/mine");
  });
});

describe("/api/orgs/:orgId", () => {
  it("GET proxies to the org and relays Spring's generic 404", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "NOT_FOUND" }, 404));
    const res = await orgGET(req("GET", "/api/orgs/9"), ctx("9"));
    expect(res.status).toBe(404);
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/9");
  });

  it("an id that is not a number never reaches Spring", async () => {
    expect((await orgGET(req("GET", "/api/orgs/abc"), ctx("abc"))).status).toBe(404);
    expect((await orgPATCH(req("PATCH", "/api/orgs/1%2F..", { name: "x" }), ctx("1/.."))).status).toBe(404);
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("PATCH forwards the body and refuses an empty one", async () => {
    await orgPATCH(req("PATCH", "/api/orgs/9", { name: "Acme 2" }), ctx("9"));
    const [path, init] = serverApiFetch.mock.calls[0]!;
    expect(path).toBe("/api/orgs/9");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ name: "Acme 2" }));
    expect((await orgPATCH(req("PATCH", "/api/orgs/9", ""), ctx("9"))).status).toBe(400);
  });
});

describe("billing, activation and create (E2E-O4.0 / O2.1)", () => {
  it("GET billing and POST activate go to the org's routes; the id must be numeric", async () => {
    await billingGET(req("GET", "/api/orgs/9/billing"), ctx("9"));
    expect(serverApiFetch.mock.calls[0]![0]).toBe("/api/orgs/9/billing");
    await activatePOST(req("POST", "/api/orgs/9/activate"), ctx("9"));
    expect(serverApiFetch.mock.calls[1]![0]).toBe("/api/orgs/9/activate");
    expect(serverApiFetch.mock.calls[1]![1]?.method).toBe("POST");
    expect((await billingGET(req("GET", "/api/orgs/x/billing"), ctx("x"))).status).toBe(404);
    expect((await activatePOST(req("POST", "/api/orgs/x/activate"), ctx("x"))).status).toBe(404);
    expect(serverApiFetch).toHaveBeenCalledTimes(2);
  });

  it("activate relays the generic 404 of an environment that does not allow it", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "NOT_FOUND" }, 404));
    const res = await activatePOST(req("POST", "/api/orgs/9/activate"), ctx("9"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("create forwards the body and relays the problem codes the flow branches on", async () => {
    serverApiFetch.mockResolvedValue(json({ code: "SLUG_TAKEN", suggestion: "acme-2" }, 409));
    const res = await createPOST(req("POST", "/api/orgs", { name: "Acme", type: "BOOTCAMP" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "SLUG_TAKEN", suggestion: "acme-2" });
    const [path, init] = serverApiFetch.mock.calls[0]!;
    expect(path).toBe("/api/orgs");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Acme", type: "BOOTCAMP" }));
    expect((await createPOST(req("POST", "/api/orgs", ""))).status).toBe(400);
  });
});

describe("POST /api/orgs/current", () => {
  const mine = [
    { orgId: 1, slug: "a", name: "A", role: "OWNER", status: "ACTIVE", memberCount: 1 },
    { orgId: 2, slug: "b", name: "B", role: "MEMBER", status: "ACTIVE", memberCount: 1 },
  ];

  it("sets the httpOnly cookie to an org the caller administers", async () => {
    serverApiFetch.mockImplementation(async () => json(mine));
    const res = await currentPOST(req("POST", "/api/orgs/current", { orgId: 1 }));
    expect(res.status).toBe(200);
    const [name, value, opts] = cookieStore.set.mock.calls[0]!;
    expect(name).toBe("kiwiply_org");
    expect(value).toBe("1");
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("refuses an org the caller only belongs to as a member, or does not belong to at all", async () => {
    serverApiFetch.mockImplementation(async () => json(mine));
    expect((await currentPOST(req("POST", "/api/orgs/current", { orgId: 2 }))).status).toBe(404);
    expect((await currentPOST(req("POST", "/api/orgs/current", { orgId: 77 }))).status).toBe(404);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("refuses a malformed body", async () => {
    expect((await currentPOST(req("POST", "/api/orgs/current", { orgId: "1; drop" }))).status).toBe(400);
    expect((await currentPOST(req("POST", "/api/orgs/current", "not json"))).status).toBe(400);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
