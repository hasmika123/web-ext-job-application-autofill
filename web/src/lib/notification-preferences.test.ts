import { afterEach, describe, expect, it, vi } from "vitest";
import { bodyFromForm, formFromView, saveNotificationPreferences, timeZoneOptions, type NotificationPrefsView } from "./notification-preferences";

const view = (over: Partial<NotificationPrefsView> = {}): NotificationPrefsView => ({
  matrix: { APP_STATUS: { inapp: true, email: "now" }, SYSTEM: { inapp: true, email: "off" } },
  quietStart: null,
  quietEnd: null,
  tz: "UTC",
  stored: false,
  emailEnabled: true,
  quietDefaults: { start: "22:00", end: "08:00" },
  kinds: [],
  updatedAt: null,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("the preferences form", () => {
  it("starts quiet hours off at the server's offered window", () => {
    const f = formFromView(view());
    expect(f.quietOn).toBe(false);
    expect([f.quietStart, f.quietEnd]).toEqual(["22:00", "08:00"]);
  });

  it("starts quiet hours on at the saved window", () => {
    const f = formFromView(view({ quietStart: "23:30", quietEnd: "07:00" }));
    expect(f.quietOn).toBe(true);
    expect([f.quietStart, f.quietEnd]).toEqual(["23:30", "07:00"]);
  });

  it("copies the matrix, so editing the form never edits the loaded view", () => {
    const v = view();
    const f = formFromView(v);
    f.matrix.APP_STATUS.email = "off";
    expect(v.matrix.APP_STATUS.email).toBe("now");
  });

  it("sends no quiet times when quiet hours are off, even if a window is remembered", () => {
    const body = bodyFromForm({ ...formFromView(view()), quietOn: false });
    expect(body.quietStart).toBeNull();
    expect(body.quietEnd).toBeNull();
    expect(bodyFromForm({ ...formFromView(view()), quietOn: true })).toMatchObject({ quietStart: "22:00", quietEnd: "08:00", tz: "UTC" });
  });
});

describe("saveNotificationPreferences", () => {
  const form = formFromView(view());
  const answer = (status: number, body: unknown = {}) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it("PUTs the whole panel through the BFF", async () => {
    answer(200);
    expect(await saveNotificationPreferences(form)).toEqual({ kind: "ok" });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/notification-preferences");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).tz).toBe("UTC");
  });

  it("a 422 is not retried by timer, and says why", async () => {
    answer(422, { detail: "That isn't a time zone we know" });
    expect(await saveNotificationPreferences(form)).toEqual({ kind: "fatal", message: "That isn't a time zone we know" });
  });

  it("a demo account's 403 and a signed-out 401 are fatal; a 5xx or a dropped connection retries", async () => {
    answer(403);
    expect((await saveNotificationPreferences(form)).kind).toBe("fatal");
    answer(401);
    expect((await saveNotificationPreferences(form)).kind).toBe("fatal");
    answer(503);
    expect((await saveNotificationPreferences(form)).kind).toBe("network");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect((await saveNotificationPreferences(form)).kind).toBe("network");
  });
});

describe("timeZoneOptions", () => {
  it("always offers UTC and the current zone, sorted, without duplicates", () => {
    const zones = timeZoneOptions("Mars/Olympus");
    expect(zones).toContain("UTC");
    expect(zones).toContain("Mars/Olympus");
    expect(new Set(zones).size).toBe(zones.length);
    expect([...zones].sort((a, b) => a.localeCompare(b))).toEqual(zones);
  });
});
