import { describe, expect, it } from "vitest";
import { createSharedCalls } from "@/lib/ent/share-calls";

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("createSharedCalls", () => {
  it("makes one call for a burst of identical concurrent requests (the menu's prefetch fan-out)", async () => {
    const shared = createSharedCalls<string>({ ttlMs: 2000, isShareable: (v) => v === "OK" });
    const gate = deferred<string>();
    let calls = 0;
    const run = () => (calls++, gate.promise);
    const burst = Array.from({ length: 14 }, () => shared.share("acme|token-a", run));
    expect(calls).toBe(1);
    gate.resolve("OK");
    expect(await Promise.all(burst)).toEqual(Array(14).fill("OK"));
  });

  it("keeps a success for the window only, then asks again", async () => {
    let t = 1000;
    const shared = createSharedCalls<string>({ ttlMs: 2000, isShareable: () => true, now: () => t });
    let calls = 0;
    const run = async () => `v${++calls}`;
    expect(await shared.share("k", run)).toBe("v1");
    t += 1999;
    expect(await shared.share("k", run)).toBe("v1");
    t += 2;
    expect(await shared.share("k", run)).toBe("v2");
  });

  it("never remembers a failure: a refused or unavailable answer is asked afresh the next time", async () => {
    const shared = createSharedCalls<string>({ ttlMs: 2000, isShareable: (v) => v === "OK" });
    let calls = 0;
    const answers = ["UNAVAILABLE", "OK"];
    const run = async () => answers[calls++];
    expect(await shared.share("k", run)).toBe("UNAVAILABLE");
    expect(await shared.share("k", run)).toBe("OK"); // "Try again" really tries again
    expect(calls).toBe(2);
    expect(await shared.share("k", run)).toBe("OK"); // and the good answer is then shared
    expect(calls).toBe(2);
  });

  it("drops a call that throws", async () => {
    const shared = createSharedCalls<string>({ ttlMs: 2000, isShareable: () => true });
    let calls = 0;
    await expect(shared.share("k", async () => (calls++, Promise.reject(new Error("boom"))))).rejects.toThrow("boom");
    expect(await shared.share("k", async () => (calls++, "fine"))).toBe("fine");
    expect(calls).toBe(2);
  });

  it("never shares between different keys (two people, two hosts)", async () => {
    const shared = createSharedCalls<string>({ ttlMs: 2000, isShareable: () => true });
    expect(await shared.share("acme|token-a", async () => "sarah")).toBe("sarah");
    expect(await shared.share("acme|token-b", async () => "omar")).toBe("omar");
    expect(await shared.share("beta|token-a", async () => "other host")).toBe("other host");
  });

  it("stays bounded under a flood of distinct keys", async () => {
    const shared = createSharedCalls<number>({ ttlMs: 60_000, isShareable: () => true, maxEntries: 10 });
    for (let i = 0; i < 100; i++) await shared.share(`k${i}`, async () => i);
    let calls = 0;
    await shared.share("k0", async () => (calls++, 0));
    expect(calls).toBe(1); // evicted long ago, so it runs again rather than the map growing without limit
  });
});
