// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTenantCache } from "@/lib/tenant";
import { proxy } from "./proxy";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => clearTenantCache());

function stubApi(enterprise: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (String(url).endsWith("/api/config/public")) return Response.json({ orgs: true, demo: false, enterprise });
      const host = init?.headers?.["X-Kiwiply-Host"];
      return host === "acme.localhost" ? Response.json({ kind: "TENANT", displayName: "Acme Staffing" }) : new Response("{}", { status: 404 });
    }),
  );
}
const req = (path: string, host: string, extra: Record<string, string> = {}) => new NextRequest(`http://${host}${path}`, { headers: { host, ...extra } });
const rewritten = (res: Response) => res.headers.get("x-middleware-rewrite");
const override = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

describe("proxy host handling (X1.4)", () => {
  it("a platform host passes through untouched and carries x-kiwiply-host", async () => {
    stubApi(true);
    const res = await proxy(req("/pricing", "localhost:3100"));
    expect(rewritten(res)).toBeNull();
    expect(override(res, "x-kiwiply-host")).toBe("localhost");
  });

  it("a served tenant host is rewritten under /_t, the root to /_t", async () => {
    stubApi(true);
    expect(rewritten(await proxy(req("/login", "acme.localhost:3100")))).toContain("/_t/login");
    const home = await proxy(req("/", "acme.localhost:3100"));
    expect(new URL(rewritten(home)!).pathname).toBe("/_t");
    expect(override(home, "x-kiwiply-host")).toBe("acme.localhost");
  });

  it("x-forwarded-host wins over host, and a browser-sent x-kiwiply-host is overwritten", async () => {
    stubApi(true);
    const res = await proxy(req("/", "web:3000", { "x-forwarded-host": "acme.localhost", "x-kiwiply-host": "evil.com" }));
    expect(override(res, "x-kiwiply-host")).toBe("acme.localhost");
  });

  it("an unknown host is rewritten too (the tenant layout answers 404)", async () => {
    stubApi(true);
    expect(rewritten(await proxy(req("/", "nobody.localhost:3100")))).toContain("/_t");
  });

  it("the BFF (/api/*) on a tenant host is not rewritten but still carries the host", async () => {
    stubApi(true);
    const res = await proxy(req("/api/auth/me", "acme.localhost"));
    expect(rewritten(res)).toBeNull();
    expect(override(res, "x-kiwiply-host")).toBe("acme.localhost");
  });

  it("flag off: a non-reserved host behaves like the platform (no rewrite)", async () => {
    stubApi(false);
    expect(rewritten(await proxy(req("/pricing", "nobody.localhost")))).toBeNull();
  });

  it("a platform host asking for /_t/* never reaches the tenant tree", async () => {
    stubApi(true);
    const res = await proxy(req("/_t/login", "localhost:3100"));
    expect(rewritten(res)).toContain("/_not-a-tenant-host");
  });
});
