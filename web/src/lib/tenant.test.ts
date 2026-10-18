// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTenantCache, resolveHost } from "./tenant";
import { isPlatformHost, isRewriteExempt, normalizeHost, requestHost, tenantApiHeaders, trustProxyHost } from "./tenant-host";

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

  it("TRUST_PROXY_HOST=false ignores x-forwarded-host (a web container with no edge proxy in front of it)", () => {
    const h = new Headers({ host: "web:3000", "x-forwarded-host": "acme.kiwiply.com" });
    expect(requestHost(h, false)).toBe("web");
    expect(requestHost(h, true)).toBe("acme.kiwiply.com");
    expect(trustProxyHost(undefined)).toBe(true); // the default: production sits behind Caddy
    expect(trustProxyHost("false")).toBe(false);
    expect(trustProxyHost("0")).toBe(false);
    expect(trustProxyHost("true")).toBe(true);
  });
});

describe("tenantApiHeaders", () => {
  it("carries the host, the shared secret and the visitor's address; nothing for a blank host", () => {
    expect(tenantApiHeaders("acme.kiwiply.com", "203.0.113.5", " s3cret ")).toEqual({
      "X-Kiwiply-Host": "acme.kiwiply.com",
      "X-Kiwiply-Host-Secret": "s3cret",
      "X-Forwarded-For": "203.0.113.5",
    });
    expect(tenantApiHeaders("acme.kiwiply.com", "unknown", "")).toEqual({ "X-Kiwiply-Host": "acme.kiwiply.com" });
    expect(tenantApiHeaders("", "1.2.3.4", "s")).toEqual({});
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

  it("flag on: 404 is UNKNOWN; a PLATFORM answer is PLATFORM; garbage is UNKNOWN", async () => {
    stubApi({ enterprise: true });
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "UNKNOWN" });
    stubApi({ enterprise: true, tenant: () => Response.json({ kind: "PLATFORM" }) });
    expect(await resolveHost("staging.localhost")).toEqual({ kind: "PLATFORM" });
    stubApi({ enterprise: true, tenant: () => new Response("<html>", { status: 200 }) });
    expect(await resolveHost("a.localhost")).toEqual({ kind: "UNKNOWN" });
    stubApi({ enterprise: true, tenant: () => new Response("", { status: 403 }) });
    expect(await resolveHost("c.localhost")).toEqual({ kind: "UNKNOWN" });
  });

  it("a 429 or a 5xx or a timeout from the API is UNAVAILABLE (retry), never the 'doesn't exist' UNKNOWN, and is not remembered", async () => {
    for (const status of [429, 500, 502, 503]) {
      stubApi({ enterprise: true, tenant: () => new Response("", { status }) });
      expect(await resolveHost("busy.localhost")).toEqual({ kind: "UNAVAILABLE" });
    }
    const fn = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/config/public")) return Response.json({ enterprise: true });
      throw new Error("ETIMEDOUT");
    });
    vi.stubGlobal("fetch", fn);
    expect(await resolveHost("slow.localhost")).toEqual({ kind: "UNAVAILABLE" });
    expect(await resolveHost("slow.localhost")).toEqual({ kind: "UNAVAILABLE" });
    expect(tenantCalls(fn as unknown as ReturnType<typeof stubApi>)).toHaveLength(2); // asked again each time
  });

  it("forwards the visitor's address and the shared secret so the API's per-visitor limit sees the visitor", async () => {
    vi.stubEnv("DOSSIER_TENANT_HOST_SECRET", "web-api-secret");
    const fn = stubApi({ enterprise: true, tenant: () => Response.json(ACME) });
    await resolveHost("acme.localhost", "203.0.113.77");
    const init = tenantCalls(fn)[0][1] as { headers: Record<string, string> };
    expect(init.headers["X-Forwarded-For"]).toBe("203.0.113.77");
    expect(init.headers["X-Kiwiply-Host-Secret"]).toBe("web-api-secret");
    vi.unstubAllEnvs();
  });

  it("config unreachable and the flag never seen on: legacy behaviour (PLATFORM), so a container name or raw IP is not turned into a tenant 404", async () => {
    stubApi({ configStatus: 500 });
    expect(await resolveHost("nobody.localhost")).toEqual({ kind: "PLATFORM" });
    expect(await resolveHost("localhost")).toEqual({ kind: "PLATFORM" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await resolveHost("10.0.0.7")).toEqual({ kind: "PLATFORM" });
  });

  it("config unreachable after the flag was last seen ON fails closed: UNAVAILABLE for a non-reserved host, a reserved one still PLATFORM", async () => {
    stubApi({ enterprise: true, tenant: () => Response.json(ACME) });
    expect((await resolveHost("acme.localhost")).kind).toBe("TENANT");
    stubApi({ configStatus: 500 });
    expect(await resolveHost("other.localhost")).toEqual({ kind: "UNAVAILABLE" });
    expect(await resolveHost("localhost")).toEqual({ kind: "PLATFORM" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await resolveHost("other.localhost")).toEqual({ kind: "UNAVAILABLE" });
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
