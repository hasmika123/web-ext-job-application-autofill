// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTenantCache } from "@/lib/tenant";
import { proxy } from "./proxy";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => clearTenantCache());

type Call = { url: string; headers: Record<string, string>; body?: string };
let calls: Call[] = [];
let refreshAnswer: (call: Call) => Response = () => new Response("{}", { status: 401 });

function stubApi(enterprise: boolean) {
  calls = [];
  refreshAnswer = () => new Response("{}", { status: 401 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
      const call = { url: String(url), headers: init?.headers ?? {}, body: init?.body };
      calls.push(call);
      if (call.url.endsWith("/api/config/public")) return Response.json({ orgs: true, demo: false, enterprise });
      if (call.url.endsWith("/api/refresh")) return refreshAnswer(call);
      const host = call.headers["X-Kiwiply-Host"];
      return host === "acme.localhost" || host === "beta.localhost" ? Response.json({ kind: "TENANT", displayName: "Tenant" }) : new Response("{}", { status: 404 });
    }),
  );
}
const req = (path: string, host: string, extra: Record<string, string> = {}, method = "GET") =>
  new NextRequest(`http://${host}${path}`, { method, headers: { host, ...extra } });
const rewritten = (res: Response) => res.headers.get("x-middleware-rewrite");
const override = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);
const location = (res: Response) => res.headers.get("location");

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: Record<string, unknown>, ttlSec = 900) => `${b64({ alg: "none" })}.${b64({ exp: Math.floor(Date.now() / 1000) + ttlSec, ...claims })}.sig`;
const tenantAccess = (tid: unknown = 12, ttl = 900) => jwt({ sub: "owner", tid }, ttl);
const cookie = (pairs: Record<string, string>) => ({ cookie: Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join("; ") });
const signedIn = cookie({ "__Host-kiwiply_access": tenantAccess() });
const setCookies = (res: Response) => res.headers.getSetCookie();

describe("proxy host handling (X1.4)", () => {
  it("a platform host passes through untouched and carries x-kiwiply-host", async () => {
    stubApi(true);
    const res = await proxy(req("/pricing", "localhost:3100"));
    expect(rewritten(res)).toBeNull();
    expect(override(res, "x-kiwiply-host")).toBe("localhost");
  });

  it("a served tenant host is rewritten under /_t, the root to /_t (signed in)", async () => {
    stubApi(true);
    expect(rewritten(await proxy(req("/login", "acme.localhost:3100")))).toContain("/_t/login");
    const home = await proxy(req("/", "acme.localhost:3100", signedIn));
    expect(new URL(rewritten(home)!).pathname).toBe("/_t");
    expect(override(home, "x-kiwiply-host")).toBe("acme.localhost");
  });

  it("x-forwarded-host wins over host, and a browser-sent x-kiwiply-host is overwritten", async () => {
    stubApi(true);
    const res = await proxy(req("/login", "web:3000", { "x-forwarded-host": "acme.localhost", "x-kiwiply-host": "evil.com" }));
    expect(override(res, "x-kiwiply-host")).toBe("acme.localhost");
  });

  it("an unknown host is rewritten too (the tenant layout answers 404), never sent to a login", async () => {
    stubApi(true);
    expect(rewritten(await proxy(req("/", "nobody.localhost:3100")))).toContain("/_t");
    const deep = await proxy(req("/w/admin", "nobody.localhost"));
    expect(rewritten(deep)).toContain("/_t/w/admin");
    expect(location(deep)).toBeNull();
  });

  it("the BFF (/api/*) on a tenant host is not rewritten but still carries the host", async () => {
    stubApi(true);
    const res = await proxy(req("/api/auth/me", "acme.localhost"));
    expect(rewritten(res)).toBeNull();
    expect(override(res, "x-kiwiply-host")).toBe("acme.localhost");
  });

  it("flag off: a non-reserved host behaves like the platform (no rewrite, no login redirect)", async () => {
    stubApi(false);
    const res = await proxy(req("/w/admin", "nobody.localhost"));
    expect(rewritten(res)).toBeNull();
    expect(location(res)).toBeNull();
  });

  it("a platform host asking for /_t/* never reaches the tenant tree", async () => {
    stubApi(true);
    const res = await proxy(req("/_t/login", "localhost:3100"));
    expect(rewritten(res)).toContain("/_not-a-tenant-host");
  });
});

describe("tenant login-first routing (X2.6)", () => {
  it("signed out: the root and every other path go to the tenant's /login (307, same host)", async () => {
    stubApi(true);
    const root = await proxy(req("/", "acme.localhost:3100"));
    expect(root.status).toBe(307);
    expect(location(root)).toBe("http://acme.localhost:3100/login");

    const deep = await proxy(req("/w/admin?tab=2", "acme.localhost:3100"));
    expect(deep.status).toBe(307);
    expect(location(deep)).toBe("http://acme.localhost:3100/login?next=%2Fw%2Fadmin%3Ftab%3D2");

    // a personal-app path is not special: signed out it is login-first like the rest, and signed in it is the tenant 404 state
    expect(location(await proxy(req("/dashboard", "acme.localhost")))).toContain("/login?next=%2Fdashboard");
    const personal = await proxy(req("/dashboard", "acme.localhost", signedIn));
    expect(rewritten(personal)).toContain("/_t/dashboard");
  });

  it("the sign-in and its helpers stay open signed out", async () => {
    stubApi(true);
    for (const p of ["/login", "/forgot-password", "/reset-password", "/account/activate", "/join/t/abc"]) {
      const res = await proxy(req(p, "acme.localhost"));
      expect(location(res), p).toBeNull();
      expect(rewritten(res), p).toContain(`/_t${p}`);
    }
  });

  it("static files and tenant assets need no session", async () => {
    stubApi(true);
    expect(location(await proxy(req("/tenant-assets/logo", "acme.localhost")))).toBeNull();
    expect(location(await proxy(req("/robots.txt", "acme.localhost")))).toBeNull();
  });

  it("signed in (a tid-bound __Host- token): the tenant tree is served", async () => {
    stubApi(true);
    const res = await proxy(req("/w/admin", "acme.localhost", signedIn));
    expect(rewritten(res)).toContain("/_t/w/admin");
    expect(location(res)).toBeNull();
  });

  it("an access token WITHOUT a tid is not a tenant session", async () => {
    stubApi(true);
    const res = await proxy(req("/w/admin", "acme.localhost", cookie({ "__Host-kiwiply_access": jwt({ sub: "x" }) })));
    expect(res.status).toBe(307);
    expect(setCookies(res).join("\n")).toContain("__Host-kiwiply_access=;");
  });

  it("the platform's plain cookies are never read on a tenant host (a valid platform session is not a tenant session)", async () => {
    stubApi(true);
    const res = await proxy(req("/w/admin", "acme.localhost", cookie({ kiwiply_access: tenantAccess(), kiwiply_refresh: "r" })));
    expect(res.status).toBe(307);
    expect(calls.some((c) => c.url.endsWith("/api/refresh"))).toBe(false);
  });

  it("an open-redirect attempt as the path lands on the tenant's own login, never off-host", async () => {
    stubApi(true);
    for (const p of ["//evil/x", "/%2F%2Fevil", "/\\evil"]) {
      const res = await proxy(req(p, "acme.localhost"));
      expect(res.status, p).toBe(307);
      expect(new URL(location(res)!).host, p).toBe("acme.localhost");
    }
    const evil = await proxy(req("//evil/x", "acme.localhost"));
    expect(location(evil)).toBe("http://acme.localhost/login"); // an unsafe return-to is dropped, not repaired
  });

  it("a return-to never points into the internal tree or the BFF", async () => {
    stubApi(true);
    expect(location(await proxy(req("/_t/secret", "acme.localhost")))).toBe("http://acme.localhost/login");
  });
});

describe("tenant session refresh (X2.6)", () => {
  it("an expired access token + refresh token: refreshed WITH the host, __Host- cookies written (Secure, no Domain, Path=/)", async () => {
    stubApi(true);
    refreshAnswer = () => Response.json({ accessToken: tenantAccess(12), refreshToken: "r2" });
    const res = await proxy(req("/w/admin", "acme.localhost:3100", cookie({ "__Host-kiwiply_access": tenantAccess(12, -600), "__Host-kiwiply_refresh": "r1" })));
    const refresh = calls.find((c) => c.url.endsWith("/api/refresh"))!;
    expect(refresh.headers["X-Kiwiply-Host"]).toBe("acme.localhost");
    expect(JSON.parse(refresh.body!)).toEqual({ refreshToken: "r1" });
    expect(rewritten(res)).toContain("/_t/w/admin");
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(2);
    for (const c of cookies) {
      expect(c).toMatch(/^__Host-kiwiply_(access|refresh)=/);
      expect(c).toContain("Secure");
      expect(c).toContain("Path=/");
      expect(c).toContain("HttpOnly");
      expect(c).not.toMatch(/Domain=/i);
    }
    // this request's own render sees the new token
    expect(override(res, "cookie")).toContain("__Host-kiwiply_refresh=r2");
  });

  it("the API refusing the refresh (another tenant's session, revoked, expired) sends the visitor to this host's login and drops the cookies", async () => {
    stubApi(true);
    refreshAnswer = () => new Response(JSON.stringify({ code: "TOKEN_TENANT_MISMATCH" }), { status: 401 });
    const res = await proxy(req("/w/admin", "beta.localhost", cookie({ "__Host-kiwiply_access": tenantAccess(12, -600), "__Host-kiwiply_refresh": "acme-refresh" })));
    expect(res.status).toBe(307);
    expect(location(res)).toBe("http://beta.localhost/login?next=%2Fw%2Fadmin");
    const cookies = setCookies(res).join("\n");
    expect(cookies).toContain("__Host-kiwiply_access=;");
    expect(cookies).toContain("__Host-kiwiply_refresh=;");
  });

  it("a refreshed token that is not tid-bound is refused", async () => {
    stubApi(true);
    refreshAnswer = () => Response.json({ accessToken: jwt({ sub: "x" }), refreshToken: "r2" });
    const res = await proxy(req("/w/admin", "acme.localhost", cookie({ "__Host-kiwiply_refresh": "r1" })));
    expect(res.status).toBe(307);
    expect(setCookies(res).join("\n")).not.toContain("=r2");
  });

  it("an API outage during refresh is not a crash: signed out for this request", async () => {
    stubApi(true);
    refreshAnswer = () => {
      throw new Error("down");
    };
    const res = await proxy(req("/w/admin", "acme.localhost", cookie({ "__Host-kiwiply_refresh": "r1" })));
    expect(res.status).toBe(307);
  });

  it("the BFF data routes get the refresh too (signed in) and are never redirected (signed out: the API answers 401)", async () => {
    stubApi(true);
    refreshAnswer = () => Response.json({ accessToken: tenantAccess(12), refreshToken: "r2" });
    const renewed = await proxy(req("/api/account", "acme.localhost", cookie({ "__Host-kiwiply_refresh": "r1" })));
    expect(rewritten(renewed)).toBeNull();
    expect(setCookies(renewed).join("\n")).toContain("__Host-kiwiply_access=");
    refreshAnswer = () => new Response("{}", { status: 401 });
    const anon = await proxy(req("/api/account", "acme.localhost"));
    expect(anon.status).toBe(200);
    expect(location(anon)).toBeNull();
  });
});

describe("same-origin enforcement on tenant hosts (T27 / SEC-16, web half)", () => {
  const post = (extra: Record<string, string>, host = "acme.localhost") => proxy(req("/api/auth/login", host, extra, "POST"));

  it("a POST needs an Origin (else Referer) on the addressed host: anything else is a generic 404", async () => {
    stubApi(true);
    expect((await post({})).status).toBe(404);
    expect((await post({ origin: "http://evil.localhost" })).status).toBe(404);
    expect((await post({ origin: "null" })).status).toBe(404);
    expect((await post({ origin: "not a url" })).status).toBe(404);
    expect((await post({ referer: "http://evil.localhost/x" })).status).toBe(404);
    // a sibling tenant is another origin
    expect((await post({ origin: "http://beta.localhost" })).status).toBe(404);
  });

  it("the right Origin passes; Referer is used only when there is no Origin", async () => {
    stubApi(true);
    expect((await post({ origin: "http://acme.localhost" })).status).toBe(200);
    expect((await post({ referer: "http://acme.localhost/login" })).status).toBe(200);
    expect((await post({ origin: "http://evil.localhost", referer: "http://acme.localhost/login" })).status).toBe(404);
  });

  it("safe methods are never checked", async () => {
    stubApi(true);
    expect((await proxy(req("/login", "acme.localhost", {}, "GET"))).status).toBe(200);
    expect((await proxy(req("/login", "acme.localhost", {}, "HEAD"))).status).toBe(200);
  });

  it("a forged x-forwarded-host does not make a foreign Origin acceptable", async () => {
    stubApi(true);
    const res = await proxy(req("/api/auth/login", "web:3000", { "x-forwarded-host": "acme.localhost", origin: "http://web:3000" }, "POST"));
    expect(res.status).toBe(404);
  });

  it("the 404 carries no cookies and the tenant headers", async () => {
    stubApi(true);
    const res = await post({});
    expect(setCookies(res)).toEqual([]);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });
});

describe("tenant response headers and chrome surface (X2.6)", () => {
  it("tenant responses are noindex, nosniff, framed by nobody; the surface header says tenant (never the browser's)", async () => {
    stubApi(true);
    const res = await proxy(req("/login", "acme.localhost", { "x-kiwiply-surface": "platform" }));
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(override(res, "x-kiwiply-surface")).toBe("tenant");
    expect((await proxy(req("/", "acme.localhost"))).headers.get("x-robots-tag")).toBe("noindex, nofollow"); // the redirect too
  });

  it("an unknown tenant host is the tenant surface as well (no Kiwiply chrome on the 404)", async () => {
    stubApi(true);
    expect(override(await proxy(req("/", "nobody.localhost")), "x-kiwiply-surface")).toBe("tenant");
  });

  it("the platform is the platform surface and gets none of the tenant headers", async () => {
    stubApi(true);
    const res = await proxy(req("/pricing", "localhost:3100", { "x-kiwiply-surface": "tenant" }));
    expect(override(res, "x-kiwiply-surface")).toBe("platform");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBeNull();
  });
});

describe("platform behaviour is unchanged (X2.6 regression)", () => {
  it("signed out on a platform host: no redirect, no rewrite, whatever the path", async () => {
    stubApi(true);
    for (const p of ["/", "/dashboard", "/w/admin", "/login", "/pricing", "/org"]) {
      const res = await proxy(req(p, "localhost:3100"));
      expect(res.status, p).toBe(200);
      expect(rewritten(res), p).toBeNull();
      expect(location(res), p).toBeNull();
    }
  });

  it("platform: an expired access token + refresh token refreshes with the PLAIN cookie names, no host header, non-__Host- cookies", async () => {
    stubApi(true);
    refreshAnswer = () => Response.json({ accessToken: jwt({ sub: "u" }), refreshToken: "r2" });
    const res = await proxy(req("/dashboard", "localhost:3100", cookie({ kiwiply_access: jwt({ sub: "u" }, -600), kiwiply_refresh: "r1" })));
    const refresh = calls.find((c) => c.url.endsWith("/api/refresh"))!;
    expect(refresh.headers).toEqual({ "content-type": "application/json" });
    const cookies = setCookies(res);
    expect(cookies.map((c) => c.split("=")[0]).sort()).toEqual(["kiwiply_access", "kiwiply_refresh"]);
    for (const c of cookies) expect(c).not.toContain("__Host-");
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  it("platform: __Host- tenant cookies do nothing", async () => {
    stubApi(true);
    const res = await proxy(req("/dashboard", "localhost:3100", cookie({ "__Host-kiwiply_refresh": "r1" })));
    expect(calls.some((c) => c.url.endsWith("/api/refresh"))).toBe(false);
    expect(setCookies(res)).toEqual([]);
  });

  it("platform: the auth endpoints are left alone (no host header, no origin check, no cookies), exactly as when the matcher skipped them", async () => {
    stubApi(true);
    const res = await proxy(req("/api/auth/login", "localhost:3100", {}, "POST"));
    expect(res.status).toBe(200);
    expect(override(res, "x-kiwiply-host")).toBeNull();
    expect(override(res, "x-kiwiply-surface")).toBeNull();
  });

  it("platform: a POST with no Origin is not checked", async () => {
    stubApi(true);
    expect((await proxy(req("/api/account", "localhost:3100", {}, "POST"))).status).toBe(200);
  });
});

describe("forced password change on a tenant host (administrator-issued temporary password)", () => {
  const mustChange = cookie({ "__Host-kiwiply_access": jwt({ sub: "owner", tid: 12, pcr: true }) });

  it("every page goes to /change-password while the token says the temporary password stands", async () => {
    stubApi(true);
    for (const path of ["/", "/w/admin", "/w/admin/employees"]) {
      const res = await proxy(req(path, "acme.localhost:3100", mustChange));
      expect(res.status).toBe(307);
      expect(new URL(location(res)!).pathname).toBe("/change-password");
    }
    expect(calls.some((c) => c.url.endsWith("/api/refresh"))).toBe(false); // no refresh: it would rotate the token on every request
  });

  it("the change-password screen itself is served (rewritten into the tenant tree), and so is the BFF", async () => {
    stubApi(true);
    const page = await proxy(req("/change-password", "acme.localhost:3100", mustChange));
    expect(location(page)).toBeNull();
    expect(new URL(rewritten(page)!).pathname).toBe("/_t/change-password");
    const api = await proxy(req("/api/auth/change-password", "acme.localhost:3100", mustChange, "POST"));
    expect(location(api)).toBeNull();
  });

  it("a token without the claim is untouched", async () => {
    stubApi(true);
    const res = await proxy(req("/w/admin", "acme.localhost:3100", signedIn));
    expect(location(res)).toBeNull();
    expect(new URL(rewritten(res)!).pathname).toBe("/_t/w/admin");
  });

  it("a refresh that returns a clean pair after the change lets the person through", async () => {
    stubApi(true);
    refreshAnswer = () => Response.json({ accessToken: tenantAccess(), refreshToken: "r2" });
    const expired = cookie({ "__Host-kiwiply_access": jwt({ sub: "owner", tid: 12, pcr: true }, -600), "__Host-kiwiply_refresh": "r1" });
    const res = await proxy(req("/w/admin", "acme.localhost:3100", expired));
    expect(location(res)).toBeNull();
    expect(new URL(rewritten(res)!).pathname).toBe("/_t/w/admin");
  });
});
