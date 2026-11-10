import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectExtension } from "./extension-signal";
import { isPhoneUa } from "./onboarding/device";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as unknown as { chrome?: unknown }).chrome;
});

describe("detectExtension (the setup payoff's 300 ms look)", () => {
  it("Chrome / Edge: an answer from the extension means it is installed", async () => {
    (window as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: (_id: string, _m: unknown, cb: () => void) => cb() } };
    await expect(detectExtension(300)).resolves.toBe(true);
  });

  it("Chrome / Edge: a lastError (nobody home) means it is not", async () => {
    const chrome = { runtime: { lastError: { message: "Could not establish connection" }, sendMessage: (_id: string, _m: unknown, cb: () => void) => cb() } };
    (window as unknown as { chrome: unknown }).chrome = chrome;
    await expect(detectExtension(300)).resolves.toBe(false);
  });

  it("Chrome / Edge: no answer within the time is a no", async () => {
    (window as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage: () => undefined } };
    const found = detectExtension(300);
    vi.advanceTimersByTime(301);
    await expect(found).resolves.toBe(false);
  });

  it("Firefox: the connect relay's PONG means it is installed", async () => {
    const found = detectExtension(300);
    window.dispatchEvent(new MessageEvent("message", { data: { type: "KIWIPLY_CONNECT_PONG" }, source: window, origin: window.location.origin }));
    await expect(found).resolves.toBe(true);
  });

  it("Firefox: silence is a no, and the listener is let go", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const found = detectExtension(300);
    vi.advanceTimersByTime(301);
    await expect(found).resolves.toBe(false);
    expect(remove).toHaveBeenCalledWith("message", expect.any(Function));
  });
});

describe("isPhoneUa", () => {
  it("phones and tablets, not laptops", () => {
    expect(isPhoneUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148")).toBe(true);
    expect(isPhoneUa("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36")).toBe(true);
    expect(isPhoneUa("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isPhoneUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36")).toBe(false);
    expect(isPhoneUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0")).toBe(false);
    expect(isPhoneUa("")).toBe(false);
  });
});
