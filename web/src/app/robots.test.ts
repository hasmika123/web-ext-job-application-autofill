import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ surface: null as string | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(store.surface ? { "x-kiwiply-surface": store.surface } : {}) }));

import robots from "./robots";
import sitemap from "./sitemap";

describe("robots.txt and sitemap.xml: a tenant host never names Kiwiply", () => {
  it("Kiwiply's own hosts get the public pages, the sitemap and the host", async () => {
    store.surface = "platform";
    const r = await robots();
    expect(r.sitemap).toBe("https://kiwiply.com/sitemap.xml");
    expect(r.host).toBe("https://kiwiply.com");
    const s = await sitemap();
    expect(s.length).toBeGreaterThan(3);
    expect(s.every((e) => e.url.startsWith("https://kiwiply.com"))).toBe(true);
  });

  it("a tenant host (or one the proxy did not mark) keeps crawlers out and names nothing", async () => {
    for (const surface of ["tenant", null]) {
      store.surface = surface;
      const r = await robots();
      expect(r).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
      expect(JSON.stringify(r)).not.toMatch(/kiwiply/i);
      expect(await sitemap()).toEqual([]);
    }
  });
});
