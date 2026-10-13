// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const hdrs = vi.hoisted(() => ({ value: new Headers() as Headers | "throw" }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (hdrs.value === "throw") throw new Error("outside a request scope");
    return hdrs.value;
  },
}));
vi.mock("@/lib/auth", () => ({ getAccessToken: async () => "tok" }));

import { serverApiFetch } from "./api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const fn = vi.fn(async (..._args: unknown[]) => new Response("{}"));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sentHeaders = (fn: ReturnType<typeof stubFetch>) => (fn.mock.calls[0][1] as { headers: Headers }).headers;

describe("serverApiFetch", () => {
  it("forwards the request's x-kiwiply-host as X-Kiwiply-Host, with the bearer token", async () => {
    hdrs.value = new Headers({ "x-kiwiply-host": "acme.localhost" });
    const fn = stubFetch();
    await serverApiFetch("/api/account");
    expect(sentHeaders(fn).get("x-kiwiply-host")).toBe("acme.localhost");
    expect(sentHeaders(fn).get("authorization")).toBe("Bearer tok");
  });

  it("sends no host header when there is none, and survives being called outside a request", async () => {
    hdrs.value = new Headers();
    let fn = stubFetch();
    await serverApiFetch("/api/account");
    expect(sentHeaders(fn).has("x-kiwiply-host")).toBe(false);
    hdrs.value = "throw";
    fn = stubFetch();
    await serverApiFetch("/api/account");
    expect(sentHeaders(fn).has("x-kiwiply-host")).toBe(false);
  });
});
