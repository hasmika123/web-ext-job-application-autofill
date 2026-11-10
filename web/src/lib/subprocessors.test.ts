import { afterEach, describe, expect, it, vi } from "vitest";
import { getSubprocessors, normalizeSubprocessors } from "./subprocessors";
import { normalizeAdminSubprocessors, slotId, toValue } from "./subprocessors-admin";

afterEach(() => vi.unstubAllGlobals());

describe("public subprocessor feed", () => {
  it("keeps well-formed entries, trims text and drops a link that is not https", () => {
    const out = normalizeSubprocessors({
      items: [
        { name: " Stripe ", purpose: "Payments", data: "E-mail", location: "US", link: "https://stripe.com/privacy" },
        { name: "Odd", purpose: "x", data: "y", location: "z", link: "javascript:alert(1)" },
        { purpose: "no name" },
        "junk",
      ],
    });
    expect(out).toEqual([
      { name: "Stripe", purpose: "Payments", data: "E-mail", location: "US", link: "https://stripe.com/privacy" },
      { name: "Odd", purpose: "x", data: "y", location: "z", link: "" },
    ]);
    expect(normalizeSubprocessors(null)).toEqual([]);
    expect(normalizeSubprocessors({ items: "no" })).toEqual([]);
  });

  it("returns null (not an empty list) when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await getSubprocessors()).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    expect(await getSubprocessors()).toBeNull();
  });

  it("reads the public path with no token", async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ name: "A" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    expect(await getSubprocessors()).toEqual([{ name: "A", purpose: "", data: "", location: "", link: "" }]);
    expect(String(fn.mock.calls[0][0])).toContain("/api/public/legal/subprocessors");
    expect(fn.mock.calls[0][1]?.headers).toBeUndefined();
  });
});

describe("admin subprocessor slots", () => {
  it("normalises slots in order and sends only non-empty fields", () => {
    const slots = normalizeAdminSubprocessors({
      items: [
        { slot: 2, empty: true },
        { slot: 1, empty: false, name: "AWS", purpose: "Files", data: "", location: "US", link: "https://aws.amazon.com/privacy/", dpaStatus: "To be confirmed" },
        { slot: 99, name: "bad" },
      ],
    })!;
    expect(slots.map((s) => s.slot)).toEqual([1, 2]);
    expect(slots[0].empty).toBe(false);
    expect(slots[1].empty).toBe(true);
    expect(toValue(slots[0].entry)).toEqual({ name: "AWS", purpose: "Files", location: "US", link: "https://aws.amazon.com/privacy/", dpaStatus: "To be confirmed" });
    expect(toValue(slots[1].entry)).toEqual({});
    expect(slotId(7)).toBe("07");
    expect(normalizeAdminSubprocessors({})).toBeNull();
  });
});
