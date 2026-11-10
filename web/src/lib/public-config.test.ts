// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicConfig, PUBLIC_CONFIG_OFF } from "./public-config";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("getPublicConfig", () => {
  it("reads the two switches from the public endpoint and asks for the five minute cache", async () => {
    const fn = stubFetch(async () => Response.json({ orgs: true, demo: false }));
    expect(await getPublicConfig()).toEqual({ orgs: true, demo: false });
    const [url, init] = fn.mock.calls[0] as unknown as [string, { next?: { revalidate?: number } }];
    expect(url).toMatch(/\/api\/config\/public$/);
    expect(init.next?.revalidate).toBe(300);
  });

  it("fails closed: an error status, a network error or a malformed body all mean orgs off", async () => {
    stubFetch(async () => new Response("nope", { status: 500 }));
    expect(await getPublicConfig()).toEqual(PUBLIC_CONFIG_OFF);
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await getPublicConfig()).toEqual(PUBLIC_CONFIG_OFF);
    stubFetch(async () => new Response("<html>", { status: 200 }));
    expect(await getPublicConfig()).toEqual(PUBLIC_CONFIG_OFF);
    stubFetch(async () => Response.json(null));
    expect(await getPublicConfig()).toEqual(PUBLIC_CONFIG_OFF);
  });

  it("only a real boolean true turns a switch on", async () => {
    stubFetch(async () => Response.json({ orgs: "true", demo: 1 }));
    expect(await getPublicConfig()).toEqual({ orgs: false, demo: false });
  });

  it("an API older than the endpoint (404) reads as off", async () => {
    stubFetch(async () => new Response(null, { status: 404 }));
    expect((await getPublicConfig()).orgs).toBe(false);
  });
});
