import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingApiError, deleteDraft, finishOnboarding, getOnboarding, patchOnboarding, putDraft, sendDraftBeacon, type DraftBody } from "./api";

const calls: { url: string; init?: RequestInit }[] = [];
let reply: () => Response | Promise<Response> = () => new Response("{}", { status: 200 });

beforeEach(() => {
  calls.length = 0;
  reply = () => new Response("{}", { status: 200 });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return reply();
  });
});
afterEach(() => vi.unstubAllGlobals());

const body: DraftBody = { v: 2, step: "review", stepsDone: 2, stepsTotal: 7, state: { v: 2 }, baseUpdatedAt: "2026-10-12T10:00:00Z" };

describe("onboarding api helpers", () => {
  it("getOnboarding asks for the state only when told to", async () => {
    reply = () => new Response(JSON.stringify({ status: "NONE" }), { status: 200 });
    expect(await getOnboarding()).toEqual({ status: "NONE" });
    await getOnboarding(true);
    expect(calls.map((c) => c.url)).toEqual(["/api/profile/onboarding", "/api/profile/onboarding?include=state"]);
  });

  it("putDraft sends the body as JSON with PUT", async () => {
    reply = () => new Response(JSON.stringify({ updatedAt: "t1", expiresAt: "t2" }), { status: 200 });
    expect(await putDraft(body)).toEqual({ updatedAt: "t1", expiresAt: "t2" });
    expect(calls[0].url).toBe("/api/profile/onboarding/draft");
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual(body);
  });

  it("deleteDraft treats 204 as success; patch and finish use their routes", async () => {
    reply = () => new Response(null, { status: 204 });
    await expect(deleteDraft()).resolves.toBeUndefined();
    reply = () => new Response("{}", { status: 200 });
    await patchOnboarding({ card: { action: "SNOOZE" } });
    await patchOnboarding({ persona: null });
    await finishOnboarding();
    expect(calls.map((c) => `${c.init?.method} ${c.url}`)).toEqual([
      "DELETE /api/profile/onboarding/draft",
      "PATCH /api/profile/onboarding",
      "PATCH /api/profile/onboarding",
      "POST /api/profile/onboarding/finish",
    ]);
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ card: { action: "SNOOZE" } });
    expect(JSON.parse(calls[2].init?.body as string)).toEqual({ persona: null });
  });

  it("a 409 carries its code and the stored draft's updatedAt", async () => {
    reply = () => new Response(JSON.stringify({ code: "DRAFT_CONFLICT", serverUpdatedAt: "2026-10-12T11:00:00Z" }), { status: 409 });
    const err = await putDraft(body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OnboardingApiError);
    expect(err).toMatchObject({ status: 409, code: "DRAFT_CONFLICT", serverUpdatedAt: "2026-10-12T11:00:00Z" });
    expect((err as OnboardingApiError).retryable).toBe(false);
  });

  it("413 and 422 keep the cap, the path and the class of value", async () => {
    reply = () => new Response(JSON.stringify({ code: "DRAFT_TOO_LARGE", max: 262144 }), { status: 413 });
    expect(await putDraft(body).catch((e: unknown) => e)).toMatchObject({ status: 413, code: "DRAFT_TOO_LARGE", max: 262144 });
    reply = () => new Response(JSON.stringify({ code: "SENSITIVE_CONTENT", path: "state.parsed.candidates[0]", class: "SSN_ITIN" }), { status: 422 });
    expect(await putDraft(body).catch((e: unknown) => e)).toMatchObject({ status: 422, code: "SENSITIVE_CONTENT", path: "state.parsed.candidates[0]", cls: "SSN_ITIN" });
  });

  it("a dead network is status 0 / NETWORK and worth retrying; 5xx and 429 too, a 4xx refusal not", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const net = (await putDraft(body).catch((e: unknown) => e)) as OnboardingApiError;
    expect(net).toMatchObject({ status: 0, code: "NETWORK" });
    expect(net.retryable).toBe(true);
    expect(new OnboardingApiError(502, null, "x").retryable).toBe(true);
    expect(new OnboardingApiError(429, { code: "RATE_LIMITED" }, "x").retryable).toBe(true);
    expect(new OnboardingApiError(403, { code: "DEMO_READ_ONLY" }, "x").retryable).toBe(false);
    expect(new OnboardingApiError(422, null, "x").retryable).toBe(false);
  });

  it("uses the body's message, else detail, else error, else the fallback", () => {
    expect(new OnboardingApiError(500, { message: "m", error: "e" }, "f").message).toBe("m");
    expect(new OnboardingApiError(500, { detail: "d" }, "f").message).toBe("d");
    expect(new OnboardingApiError(500, { error: "e" }, "f").message).toBe("e");
    expect(new OnboardingApiError(500, null, "f").message).toBe("f");
  });
});

const readBlob = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

describe("sendDraftBeacon", () => {
  it("posts the draft as a JSON blob to the BFF's POST alias", async () => {
    const send = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon: send });
    expect(sendDraftBeacon(body)).toBe(true);
    const [url, blob] = send.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/profile/onboarding/draft");
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await readBlob(blob))).toEqual(body);
  });

  it("says false when there is no beacon or the browser refuses it", () => {
    vi.stubGlobal("navigator", {});
    expect(sendDraftBeacon(body)).toBe(false);
    vi.stubGlobal("navigator", { sendBeacon: () => false });
    expect(sendDraftBeacon(body)).toBe(false);
  });
});
