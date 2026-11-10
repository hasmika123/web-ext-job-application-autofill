import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInterview,
  deleteInterview,
  googleCalendarUrl,
  icsHref,
  interviewTitle,
  kindLabel,
  listInterviews,
  needsOutcome,
  setInterviewOutcome,
  updateInterview,
  type Interview,
} from "@/lib/interviews";

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const interview: Interview = {
  id: 7,
  applicationId: 3,
  company: "Acme",
  roleTitle: "Backend Engineer",
  kind: "VIDEO",
  startsAt: "2026-10-10T14:00:00Z",
  endsAt: null,
  tz: "America/New_York",
  location: "https://meet.example.com/abc",
  interviewer: "Sam Rivera",
  notes: null,
  outcome: "PENDING",
  source: "WEB",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

describe("fetchers", () => {
  it("listInterviews builds the query and returns the rows", async () => {
    fetchMock.mockResolvedValue(json([interview]));
    const r = await listInterviews({ from: "2026-10-01", to: "2026-10-31", outcome: "PENDING" });
    expect(r).toEqual({ kind: "ok", data: [interview] });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/interviews?from=2026-10-01&to=2026-10-31&outcome=PENDING");
    await listInterviews();
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/interviews");
  });

  it("create / update / outcome / delete hit the application's interview routes", async () => {
    fetchMock.mockResolvedValueOnce(json(interview, 201));
    expect((await createInterview(3, { kind: "VIDEO", startsAt: "2026-10-10T14:00:00Z", tz: "America/New_York" })).kind).toBe("ok");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/applications/3/interviews");
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("POST");

    fetchMock.mockResolvedValueOnce(json({ ...interview, location: "Room 4" }));
    await updateInterview(3, 7, { location: "Room 4", endsAt: null });
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/applications/3/interviews/7");
    expect(fetchMock.mock.calls[1]![1]?.method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[1]![1]?.body as string)).toEqual({ location: "Room 4", endsAt: null });

    fetchMock.mockResolvedValueOnce(json({ ...interview, outcome: "PASSED" }));
    const o = await setInterviewOutcome(3, 7, "PASSED");
    expect(o.kind === "ok" && o.data.outcome).toBe("PASSED");
    expect(fetchMock.mock.calls[2]![0]).toBe("/api/applications/3/interviews/7/outcome");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await deleteInterview(3, 7)).toEqual({ kind: "ok", data: undefined });
    expect(fetchMock.mock.calls[3]![1]?.method).toBe("DELETE");
  });

  it("maps refusals to a tagged error with the server's path and code", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "TRACKER_INVALID", path: "endsAt", message: "endsAt: must be after startsAt" }, 422));
    expect(await updateInterview(3, 7, { endsAt: "2026-10-10T13:00:00Z" })).toEqual({
      kind: "error",
      status: 422,
      code: "TRACKER_INVALID",
      path: "endsAt",
      message: "endsAt: must be after startsAt",
    });
  });

  it("explains a never-collected value in plain words and keeps the path", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: "SENSITIVE_CONTENT", path: "notes", class: "SSN_ITIN" }, 422));
    const r = await updateInterview(3, 7, { notes: "123-45-6789" });
    expect(r).toMatchObject({ kind: "error", code: "SENSITIVE_CONTENT", path: "notes" });
    expect(r.kind === "error" && r.message).toMatch(/never store/);
  });

  it("maps 401, 404 and a dead network without throwing", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await listInterviews()).toMatchObject({ kind: "error", status: 401 });
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await deleteInterview(3, 99)).toMatchObject({ kind: "error", status: 404, message: "That interview is no longer there." });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await listInterviews()).toEqual({ kind: "error", message: "Couldn't reach the server." });
  });
});

describe("pure helpers", () => {
  it("names an interview and its kind", () => {
    expect(kindLabel("PHONE")).toBe("Phone screen");
    expect(kindLabel("???")).toBe("Interview");
    expect(interviewTitle(interview)).toBe("Video call with Acme");
    expect(interviewTitle({ kind: "ONSITE", company: null, roleTitle: null })).toBe("Onsite");
  });

  it("builds a Google Calendar link in UTC with a one hour default and a prefilled place", () => {
    const url = new URL(googleCalendarUrl(interview));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Video call with Acme");
    expect(url.searchParams.get("dates")).toBe("20261010T140000Z/20261010T150000Z");
    expect(url.searchParams.get("location")).toBe("https://meet.example.com/abc");
    expect(url.searchParams.get("details")).toBe("Role: Backend Engineer\nInterviewer: Sam Rivera\nFrom your Kiwiply tracker.");
  });

  it("uses the interview's own end time and a given default length", () => {
    const withEnd = new URL(googleCalendarUrl({ ...interview, endsAt: "2026-10-10T14:45:00Z" }));
    expect(withEnd.searchParams.get("dates")).toBe("20261010T140000Z/20261010T144500Z");
    const ninety = new URL(googleCalendarUrl({ ...interview, location: null }, 90));
    expect(ninety.searchParams.get("dates")).toBe("20261010T140000Z/20261010T153000Z");
    expect(ninety.searchParams.has("location")).toBe(false);
  });

  it("points the calendar file at the BFF", () => {
    expect(icsHref(12)).toBe("/api/interviews/12/ics");
  });

  it("asks 'how did it go?' only for pending interviews that are over", () => {
    const now = new Date("2026-10-10T16:00:00Z");
    expect(needsOutcome({ startsAt: "2026-10-10T14:00:00Z", endsAt: null, outcome: "PENDING" }, now)).toBe(true);
    expect(needsOutcome({ startsAt: "2026-10-10T15:30:00Z", endsAt: "2026-10-10T16:30:00Z", outcome: "PENDING" }, now)).toBe(false); // still on
    expect(needsOutcome({ startsAt: "2026-10-12T14:00:00Z", endsAt: null, outcome: "PENDING" }, now)).toBe(false); // future
    expect(needsOutcome({ startsAt: "2026-10-01T14:00:00Z", endsAt: null, outcome: "PASSED" }, now)).toBe(false);
  });
});
