// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTenantCache, resolveHost } from "./tenant";
import { isPlatformHost, isRewriteExempt, normalizeHost, requestHost } from "./tenant-host";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => clearTenantCache());

const ACME = { kind: "TENANT", displayName: "Acme Staffing" };

/** Routes the two endpoints the resolver uses. */
function stubApi(opts: { enterprise?: unknown; configStatus?: number; tenant?: () => Response }) {
  const fn = vi.fn(async (url: string, _init?: unknown) => {
    if (String(url).endsWith("/api/config/public")) {
      if (opts.configStatus) return new Response("x", { status: opts.configStatus });
      return Response.json({ orgs: true, demo: false, enterprise: opts.enterprise });
    }
    return opts.tenant ? opts.tenant() : new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const tenantCalls = (fn: ReturnType<typeof stubApi>) => fn.mock.calls.filter(([u]) => String(u).endsWith("/api/public/tenant"));

describe("host normalisation", () => {
  it("lower-cases, strips the port and trailing dot, takes the first forwarded value", () => {
    expect(normalizeHost("Acme.Localhost:3100")).toBe("acme.localhost");
    expect(normalizeHost("careers.acme.com., evil.com")).toBe("careers.acme.com");
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost("")).toBe("");
  });

  it("prefers x-forwarded-host over host", () => {
    const h = new Headers({ host: "web:3000", "x-forwarded-host": "careers.acme.com" });
    expect(requestHost(h)).toBe("careers.acme.com");
    expect(requestHost(new Headers({ host: "localhost:3100" }))).toBe("localhost");
  });
});

describe("platform hosts and rewrite exemptions", () => {
  it("knows loopback, the canonical site and PLATFORM_HOSTS; a tenant host is not one", () => {
    expect(isPlatformHost("localhost")).toBe(true);
    expect(isPlatformHost("kiwiply.com")).toBe(true);
    expect(isPlatformHost("www.kiwiply.com")).toBe(true);
    expect(isPlatformHost("")).toBe(true);
    expect(isPlatformHost("acme.localhost")).toBe(false);
    expect(isPlatformHost("careers.acme.com")).toBe(false);
    expect(isPlatformHost("staging.example.org", "staging.example.org, other.io")).toBe(true);
  });

  it("never rewrites the BFF, Next internals, tenant assets or static files", () => {
    for (const p of ["/api/x", "/api", "/_next/static/a.js", "/tenant-assets/logo", "/robots.txt", "/a/b.png"]) expect(isRewriteExempt(p)).toBe(true);
    for (const p of ["/", "/login", "/w/admin/people"]) expect(isRewriteExempt(p)).toBe(false);
  });
});

describe("resolveHost", () => {
  it("reserved hosts are PLATFORM without any API call", async () => {
    const fn = stubApi({ enterprise: true });
    expect(await resolveHost("localhost")).toEqual({ kind: "PLATFORM" });
    expect(await resolveHost("kiwiply.com")).toEqual({ kind: "PLATFORM" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("flag off: every host behaves as before (PLATFORM) and the tenant endpoint is never asked", async () => {
    const fn = stubApi({ enterprise: false });
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "PLATFORM" });
    expect(tenantCalls(fn)).toHaveLength(0);
  });

  it("an API older than the config key (or the endpoint, 404) reads as off", async () => {
    stubApi({ enterprise: undefined });
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "PLATFORM" });
    stubApi({ configStatus: 404 });
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "PLATFORM" });
  });

  it("flag on: a served host is TENANT and the host travels as X-Kiwiply-Host", async () => {
    const fn = stubApi({ enterprise: true, tenant: () => Response.json(ACME) });
    const r = await resolveHost("Acme.localhost:3100");
    expect(r).toEqual({ kind: "TENANT", tenant: ACME });
    const init = tenantCalls(fn)[0][1] as { headers: Record<string, string> };
    expect(init.headers["X-Kiwiply-Host"]).toBe("acme.localhost");
  });

  it("flag on: 404 is UNKNOWN; a PLATFORM answer is PLATFORM; garbage and errors are UNKNOWN", async () => {
    stubApi({ enterprise: true });
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "UNKNOWN" });
    stubApi({ enterprise: true, tenant: () => Response.json({ kind: "PLATFORM" }) });
    expect(await resolveHost("staging.localhost")).toEqual({ kind: "PLATFORM" });
    stubApi({ enterprise: true, tenant: () => new Response("<html>", { status: 200 }) });
    expect(await resolveHost("a.localhost")).toEqual({ kind: "UNKNOWN" });
    stubApi({ enterprise: true, tenant: () => new Response("", { status: 429 }) });
    expect(await resolveHost("b.localhost")).toEqual({ kind: "UNKNOWN" });
  });

  it("config unreachable fails closed: a non-reserved host is UNKNOWN, a reserved one still PLATFORM", async () => {
    stubApi({ configStatus: 500 });
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "UNKNOWN" });
    expect(await resolveHost("localhost")).toEqual({ kind: "PLATFORM" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "UNKNOWN" });
  });

  it("remembers a positive answer for a few seconds, never a failure", async () => {
    const fn = stubApi({ enterprise: true, tenant: () => Response.json(ACME) });
    await resolveHost("acme.localhost");
    await resolveHost("acme.localhost");
    expect(tenantCalls(fn)).toHaveLength(1);
    const fn2 = stubApi({ enterprise: true });
    await resolveHost("gone.localhost");
    await resolveHost("gone.localhost");
    expect(tenantCalls(fn2)).toHaveLength(2);
  });
});
