import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ surface: null as string | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(store.surface ? { "x-kiwiply-surface": store.surface } : {}) }));

import { GET } from "./route";
import { SECURITY_TXT_EXPIRES, securityTxt } from "@/lib/security-txt";

describe("/.well-known/security.txt (gap D-5)", () => {
  it("serves the RFC 9116 fields on Kiwiply's own hosts", async () => {
    store.surface = "platform";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body).toMatch(/^Contact: mailto:support@kiwiply\.com$/m);
    expect(body).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(body).toMatch(/^Canonical: https:\/\/kiwiply\.com\/\.well-known\/security\.txt$/m);
    expect(body).toMatch(/^Preferred-Languages: en$/m);
  });

  it("is a 404 on a tenant host (a consultancy's domain never names Kiwiply) and when the proxy marked nothing", async () => {
    for (const surface of ["tenant", null]) {
      store.surface = surface;
      const res = await GET();
      expect(res.status).toBe(404);
      expect(await res.text()).not.toMatch(/kiwiply/i);
    }
  });

  it("does not expire within the next 30 days: when this fails, review the contact and move the date (at most a year ahead)", () => {
    const expires = Date.parse(SECURITY_TXT_EXPIRES);
    expect(Number.isNaN(expires)).toBe(false);
    expect(expires - Date.now()).toBeGreaterThan(30 * 24 * 3600 * 1000);
    expect(expires - Date.now()).toBeLessThanOrEqual(366 * 24 * 3600 * 1000);
    expect(securityTxt().endsWith("\n")).toBe(true);
  });
});
