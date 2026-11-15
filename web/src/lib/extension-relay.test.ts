import { describe, expect, it } from "vitest";
import { pingRelay, RELAY_HANDOFF, RELAY_PING, RELAY_PONG, RELAY_RESULT, sendViaRelay, type RelayWindow } from "./extension-relay";

/** A page with (or without) the extension's relay: messages the page posts reach the relay, the relay's answers reach the page. */
function page(relay?: (data: { type?: string; tokens?: unknown }, reply: (d: unknown) => void) => void, origin = "https://careers.aaruna.com") {
  const listeners = new Set<(e: MessageEvent) => void>();
  const win: RelayWindow & { posted: unknown[] } = {
    posted: [],
    location: { origin },
    addEventListener: ((_: string, l: (e: MessageEvent) => void) => listeners.add(l)) as RelayWindow["addEventListener"],
    removeEventListener: ((_: string, l: (e: MessageEvent) => void) => listeners.delete(l)) as RelayWindow["removeEventListener"],
    postMessage: ((data: unknown) => {
      win.posted.push(data);
      const deliver = (d: unknown, from: { source: unknown; origin: string }) =>
        queueMicrotask(() => listeners.forEach((l) => l({ data: d, ...from } as unknown as MessageEvent)));
      deliver(data, { source: win, origin });
      relay?.(data as { type?: string }, (d) => deliver(d, { source: win, origin }));
    }) as RelayWindow["postMessage"],
  };
  return win;
}

describe("the page side of the extension relay", () => {
  it("finds a listening relay and hands it the session", async () => {
    const win = page((d, reply) => {
      if (d.type === RELAY_PING) reply({ type: RELAY_PONG });
      if (d.type === RELAY_HANDOFF) reply({ type: RELAY_RESULT, result: { ok: true } });
    });
    expect(await pingRelay(200, win)).toBe(true);
    expect(await sendViaRelay({ access: "a" }, 200, win)).toEqual({ ok: true });
    expect(win.posted).toContainEqual({ type: RELAY_HANDOFF, tokens: { access: "a" } });
  });

  it("times out quietly when no relay answers (the standard extension on a tenant host, or none installed)", async () => {
    const win = page();
    expect(await pingRelay(30, win)).toBe(false);
    expect(await sendViaRelay({}, 30, win)).toBeNull();
  });

  it("ignores an answer from another window or origin", async () => {
    const win = page();
    const listeners: ((e: MessageEvent) => void)[] = [];
    const spy: RelayWindow = { ...win, addEventListener: ((_: string, l: (e: MessageEvent) => void) => listeners.push(l)) as RelayWindow["addEventListener"] };
    const pending = pingRelay(50, spy);
    listeners.forEach((l) => l({ data: { type: RELAY_PONG }, source: {}, origin: "https://careers.aaruna.com" } as unknown as MessageEvent));
    listeners.forEach((l) => l({ data: { type: RELAY_PONG }, source: spy, origin: "https://evil.example" } as unknown as MessageEvent));
    expect(await pending).toBe(false);
  });
});
