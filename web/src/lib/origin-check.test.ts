import { describe, expect, it } from "vitest";
import { sameOriginForUnsafe } from "./origin-check";

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });

describe("sameOriginForUnsafe", () => {
  it("never checks safe methods", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "get"]) expect(sameOriginForUnsafe(m, h({}), "acme.localhost")).toBe(true);
  });
  it("accepts the addressed host by Origin or Referer, ignoring the port and case", () => {
    expect(sameOriginForUnsafe("POST", h({ origin: "https://Acme.Localhost:3100" }), "acme.localhost")).toBe(true);
    expect(sameOriginForUnsafe("DELETE", h({ referer: "https://acme.localhost/w/x?a=1" }), "acme.localhost")).toBe(true);
  });
  it("refuses a missing, foreign, null, non-http or unparseable origin", () => {
    for (const o of [{} as Record<string, string>,{ origin: "https://evil.com" }, { origin: "null" }, { origin: "ftp://acme.localhost" }, { origin: "acme.localhost" }, { referer: "https://evil.com/" }]) {
      expect(sameOriginForUnsafe("POST", h(o), "acme.localhost")).toBe(false);
    }
  });
  it("a present Origin decides alone (a good Referer cannot rescue a bad Origin)", () => {
    expect(sameOriginForUnsafe("POST", h({ origin: "https://evil.com", referer: "https://acme.localhost/" }), "acme.localhost")).toBe(false);
  });
  it("a sibling subdomain or a suffix trick is another origin", () => {
    expect(sameOriginForUnsafe("POST", h({ origin: "https://acme.localhost.evil.com" }), "acme.localhost")).toBe(false);
    expect(sameOriginForUnsafe("POST", h({ origin: "https://evilacme.localhost" }), "acme.localhost")).toBe(false);
  });
});
