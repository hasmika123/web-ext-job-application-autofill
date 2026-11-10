import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addNote,
  asListPage,
  bulkApplications,
  dayAndTime,
  deleteNote,
  getActivity,
  getApplication,
  patchApplication,
  pickableStatuses,
  shortDay,
  statusLabel,
  statusTone,
  timeAgo,
  updateNote,
} from "@/lib/applications";
import { toAutosave } from "@/lib/tracker-client";

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("status model", () => {
  it("says every status in words, and an unknown one as itself", () => {
    expect(statusLabel("IN_REVIEW")).toBe("Under review");
    expect(statusLabel("WITHDRAWN")).toBe("Withdrawn");
    expect(statusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(statusTone("OFFER")).toBe("violet");
    expect(statusTone("???")).toBe("slate");
  });

  it("offers IN_REVIEW and WITHDRAWN, and Draft only while it is a draft", () => {
    const picks = pickableStatuses("APPLIED");
    expect(picks).toContain("IN_REVIEW");
    expect(picks).toContain("WITHDRAWN");
    expect(picks).not.toContain("DRAFT");
    expect(pickableStatuses("DRAFT")).toContain("DRAFT");
  });
});

describe("asListPage", () => {
  it("reads the shared list shape", () => {
    const p = asListPage({ items: [{ id: 1 }], total: 31, page: 1, size: 20, summary: { ALL: 31 } });
    expect(p.total).toBe(31);
    expect(p.summary).toEqual({ ALL: 31 });
  });
  it("turns the legacy plain array, `{}` and garbage into a page", () => {
    expect(asListPage([{ id: 1 }, { id: 2 }]).total).toBe(2);
    expect(asListPage({}).items).toEqual([]);
    expect(asListPage(null).total).toBe(0);
    expect(asListPage("nope").items).toEqual([]);
  });
});

describe("dates", () => {
  const now = new Date("2026-10-12T12:00:00Z").getTime();
  it("timeAgo: minutes, hours, days, then a date", () => {
    expect(timeAgo("2026-10-12T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-12T11:30:00Z", now)).toBe("30 min ago");
    expect(timeAgo("2026-10-12T10:00:00Z", now)).toBe("2 hours ago");
    expect(timeAgo("2026-10-11T12:00:00Z", now)).toBe("1 day ago");
    expect(timeAgo("2026-10-02T12:00:00Z", now)).toBe("10 days ago");
    expect(timeAgo("2026-07-01T12:00:00Z", now)).toMatch(/Jul 1, 2026/);
    expect(timeAgo(null, now)).toBe("");
    expect(timeAgo("not a date", now)).toBe("");
  });
  it("shortDay drops the year only for this year", () => {
    expect(shortDay("2026-10-08T12:00:00Z", now)).toMatch(/^Oct 8$/);
    expect(shortDay("2025-10-08T12:00:00Z", now)).toMatch(/2025/);
    expect(shortDay(undefined)).toBe("");
  });
  it("dayAndTime joins a date and a time", () => {
    expect(dayAndTime("2026-10-14T14:00:00Z")).toMatch(/Oct 1[34] · \d{1,2}:00 [AP]M/);
    expect(dayAndTime("")).toBe("");
  });
});

describe("fetchers (the BFF routes, never throw)", () => {
  it("getApplication GETs the detail", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 7, events: [], notes: [], interviews: [], suggestions: [] }));
    const r = await getApplication(7);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/applications/7");
    expect(r.kind).toBe("ok");
  });

  it("patchApplication PATCHes only what it is given (null clears)", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 7, status: "IN_REVIEW" }));
    await patchApplication(7, { status: "IN_REVIEW", nextAction: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/applications/7");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ status: "IN_REVIEW", nextAction: null });
  });

  it("notes: POST creates, PUT patches, DELETE answers 204", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 3, body: "hi" }, 201));
    await addNote(7, "hi", true);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ body: "hi", pinned: true });
    fetchMock.mockResolvedValueOnce(json({ id: 3, body: "hello" }));
    await updateNote(7, 3, { body: "hello" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/applications/7/notes/3");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await deleteNote(7, 3)).kind).toBe("ok");
  });

  it("bulk and activity build their requests", async () => {
    fetchMock.mockResolvedValueOnce(json({ done: [1], failed: [] }));
    await bulkApplications([1, 2], "ARCHIVE");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/applications/bulk");
    fetchMock.mockResolvedValueOnce(json([{ day: "2026-10-12", count: 2 }]));
    await getActivity(30, "America/New_York");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/applications/activity?days=30&tz=America%2FNew_York");
  });

  it("a refusal carries its code and path; a sensitive value says so; a network error is a result", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "SENSITIVE_CONTENT", path: "body", message: "Remove the number." }, 422));
    const r = await addNote(7, "123-45-6789");
    expect(r).toMatchObject({ kind: "error", status: 422, code: "SENSITIVE_CONTENT", path: "body" });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await patchApplication(7, { starred: true })).toMatchObject({ kind: "error", message: "Couldn't reach the server." });
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await patchApplication(7, { starred: true })).toMatchObject({ kind: "error", status: 401 });
  });
});

describe("toAutosave", () => {
  it("maps results onto what the autosave controller expects", () => {
    expect(toAutosave({ kind: "ok", data: 1 })).toEqual({ kind: "ok" });
    expect(toAutosave({ kind: "error", message: "offline" })).toEqual({ kind: "network" });
    expect(toAutosave({ kind: "error", status: 503, message: "x" })).toEqual({ kind: "network" });
    expect(toAutosave({ kind: "error", status: 422, path: "body", message: "No." })).toEqual({ kind: "invalid", path: "body", message: "No." });
    expect(toAutosave({ kind: "error", status: 404, message: "gone" })).toEqual({ kind: "fatal", message: "gone" });
  });
});
