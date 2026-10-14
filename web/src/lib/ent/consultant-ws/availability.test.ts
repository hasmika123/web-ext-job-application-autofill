import { describe, expect, it } from "vitest";
import {
  addDays,
  blockProblem,
  dayText,
  employmentText,
  fromDateProblem,
  fromNowText,
  historyWhen,
  monthGrid,
  moneyText,
  noticeText,
  openFrom,
  paintDay,
  parseAvailability,
  prefBody,
  prefProblem,
  rangeLabel,
  rateText,
  shiftMonth,
  toMinor,
  travelText,
  upcomingUnavailable,
  type AvailabilityView,
  type Block,
  type PrefDraft,
} from "./availability";

const blk = (o: Partial<Block> = {}): Block => ({ id: 1, kind: "VACATION", startDate: "2026-10-20", endDate: "2026-10-22", days: 3, reason: null, status: "APPROVED", sample: false, ...o });
const body = (o: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: "2026-10-14T10:00:00Z",
  today: "2026-10-14",
  name: "Anika Rao",
  availability: { status: "AVAILABLE", since: "2026-10-01", availableFrom: "2026-11-04" },
  tiles: {
    availableFrom: { status: "AVAILABLE", date: "2026-11-04", daysFromNow: 21 },
    openOpportunities: { value: 8, previous: 6, deltaPct: 33.3, sparkline: [1, 2, 3, "x", 8] },
    workMode: "HYBRID",
    notice: { weeks: 2, availableOn: "2026-11-04" },
    vacation: { year: 2026, approvedDays: 12, scheduledDays: 5, pendingDays: 0 },
  },
  preferences: { locations: ["New York, NY", "Austin, TX", ""], workAuthorization: "AUTHORIZED_NO_SPONSORSHIP", workMode: "HYBRID", employmentTypes: ["CONTRACT"], rateMinMinor: 11000, rateMaxMinor: 14000, rateNote: null, travelLabel: "OCCASIONAL", travelPercent: 25, noticeWeeks: 2 },
  blocks: [blk(), { id: "x" }, { id: 3, kind: "NOPE", startDate: "2026-10-20", endDate: "2026-10-21" }],
  history: [{ id: 1, effectiveDate: "2026-10-01", availabilityStatus: "AVAILABLE", availableFrom: null, workMode: "HYBRID", status: "ACTIVE", sample: true }, { id: 2 }],
  ...o,
});
const view = (o: Partial<AvailabilityView> = {}): AvailabilityView => ({ ...(parseAvailability(body()) as AvailabilityView), ...o });

describe("parser", () => {
  it("reads the page and drops rows that are not the contract", () => {
    const v = parseAvailability(body());
    expect(v?.blocks).toHaveLength(1);
    expect(v?.history).toHaveLength(1);
    expect(v?.history[0].sample).toBe(true);
    expect(v?.preferences.locations).toEqual(["New York, NY", "Austin, TX"]);
    expect(v?.tiles.openOpportunities.sparkline).toEqual([1, 2, 3, 8]);
    expect(v?.tiles.availableFrom.daysFromNow).toBe(21);
  });
  it("is null for a body that is not the contract", () => {
    expect(parseAvailability({})).toBeNull();
    expect(parseAvailability(null)).toBeNull();
    expect(parseAvailability(body({ today: "soon" }))).toBeNull();
    expect(parseAvailability(body({ tiles: null }))).toBeNull();
  });
  it("keeps nulls as nulls, never a made-up number", () => {
    const v = parseAvailability(body({ preferences: { locations: [], employmentTypes: [] }, tiles: { availableFrom: {}, openOpportunities: { value: 0 }, notice: {}, vacation: {} } }));
    expect(v?.preferences.rateMinMinor).toBeNull();
    expect(v?.tiles.workMode).toBeNull();
    expect(v?.tiles.notice.weeks).toBeNull();
    expect(v?.tiles.openOpportunities.deltaPct).toBeNull();
    expect(v?.tiles.availableFrom.date).toBeNull();
  });
});

describe("calendar", () => {
  it("builds whole Sunday-first weeks that cover the month", () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0].iso).toBe("2026-09-27");
    expect(g[0][4]).toMatchObject({ iso: "2026-10-01", day: 1, inMonth: true });
    expect(g[0][0].inMonth).toBe(false);
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(31);
    expect(g).toHaveLength(5);
  });
  it("moves months across the year edge", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(shiftMonth(2026, 5, 14)).toEqual({ year: 2027, month0: 7 });
  });
  it("paints working days green from the open date and keeps time off on top", () => {
    const v = view({ availability: { status: "AVAILABLE", since: null, availableFrom: "2026-10-19" }, blocks: [blk({ id: 1, startDate: "2026-10-21", endDate: "2026-10-22" })], today: "2026-10-14" });
    expect(paintDay(v, "2026-10-16").available).toBe(false); // before the open date
    expect(paintDay(v, "2026-10-19").available).toBe(true); // Monday
    expect(paintDay(v, "2026-10-17").available).toBe(false); // Saturday
    const off = paintDay(v, "2026-10-21");
    expect(off.available).toBe(false);
    expect(off.blocks[0].kind).toBe("VACATION");
    expect(paintDay(v, "2026-10-23").available).toBe(true);
  });
  it("opens from today when AVAILABLE with no date, from nothing when not", () => {
    expect(openFrom({ availability: { status: "AVAILABLE", since: null, availableFrom: null }, today: "2026-10-14" })).toBe("2026-10-14");
    expect(openFrom({ availability: { status: "UNAVAILABLE", since: null, availableFrom: null }, today: "2026-10-14" })).toBeNull();
    expect(openFrom({ availability: { status: "NOTICE", since: null, availableFrom: "2026-12-01" }, today: "2026-10-14" })).toBe("2026-12-01");
  });
  it("an AVAILABLE entry paints its days even on a weekend", () => {
    const v = view({ availability: { status: "UNAVAILABLE", since: null, availableFrom: null }, blocks: [blk({ kind: "AVAILABLE", startDate: "2026-10-17", endDate: "2026-10-18" })] });
    expect(paintDay(v, "2026-10-17").available).toBe(true);
    expect(paintDay(v, "2026-10-19").available).toBe(false);
  });
  it("lists upcoming time off soonest first and leaves out past and AVAILABLE entries", () => {
    const rows = upcomingUnavailable(
      [blk({ id: 1, startDate: "2026-12-01", endDate: "2026-12-02" }), blk({ id: 2, startDate: "2026-10-01", endDate: "2026-10-02" }), blk({ id: 3, kind: "AVAILABLE", startDate: "2026-10-20", endDate: "2026-10-30" }), blk({ id: 4, startDate: "2026-10-10", endDate: "2026-10-14" }), blk({ id: 5, startDate: "2026-10-30", endDate: "2026-10-30" })],
      "2026-10-14",
    );
    expect(rows.map((r) => r.id)).toEqual([4, 5, 1]);
  });
});

describe("wording", () => {
  it("words dates without moving them across zones", () => {
    expect(dayText("2026-10-21")).toBe("Oct 21, 2026");
    expect(dayText(null)).toBe("");
    expect(rangeLabel("2026-10-08", "2026-10-09")).toBe("Oct 8, 2026 - Oct 9, 2026");
    expect(rangeLabel("2026-10-08", "2026-10-08")).toBe("Oct 8, 2026");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("says how far away the available-from date is", () => {
    expect(fromNowText({ status: "AVAILABLE", date: "2026-11-04", daysFromNow: 21 })).toBe("3 weeks from now");
    expect(fromNowText({ status: "AVAILABLE", date: "2026-10-15", daysFromNow: 1 })).toBe("1 day from now");
    expect(fromNowText({ status: "AVAILABLE", date: "2026-10-18", daysFromNow: 4 })).toBe("4 days from now");
    expect(fromNowText({ status: "AVAILABLE", date: "2026-10-14", daysFromNow: 0 })).toBe("Available now");
    expect(fromNowText({ status: "AVAILABLE", date: null, daysFromNow: null })).toBe("Available now");
    expect(fromNowText({ status: "UNAVAILABLE", date: null, daysFromNow: null })).toBe("No date set");
    expect(fromNowText({ status: "NOTICE", date: "2026-10-21", daysFromNow: 7 })).toBe("1 week from now");
  });
  it("formats notice, money, rate, travel and employment", () => {
    expect(noticeText(2)).toBe("2 weeks");
    expect(noticeText(1)).toBe("1 week");
    expect(noticeText(0)).toBe("Immediate");
    expect(noticeText(null)).toBe("Not set");
    expect(moneyText(11000)).toBe("$110");
    expect(moneyText(11050)).toBe("$110.50");
    expect(rateText({ rateMinMinor: 11000, rateMaxMinor: 14000 })).toBe("$110 - $140 per hour");
    expect(rateText({ rateMinMinor: 11000, rateMaxMinor: 11000 })).toBe("$110 per hour");
    expect(rateText({ rateMinMinor: 11000, rateMaxMinor: null })).toBe("From $110 per hour");
    expect(rateText({ rateMinMinor: null, rateMaxMinor: null })).toBe("Not set");
    expect(travelText({ travelLabel: "OCCASIONAL", travelPercent: 25 })).toEqual({ title: "Occasional travel", detail: "Up to 25% travel" });
    expect(travelText({ travelLabel: "NONE", travelPercent: 0 })).toEqual({ title: "No travel", detail: null });
    expect(travelText({ travelLabel: null, travelPercent: null }).title).toBe("Not set");
    expect(employmentText(["CONTRACT", "CONTRACT_TO_HIRE"])).toEqual({ title: "Contract", detail: "Open to Contract-to-Hire" });
    expect(employmentText([]).title).toBe("Not set");
    expect(historyWhen({ availableFrom: null, effectiveDate: "2026-10-01" })).toBe("Immediately");
    expect(historyWhen({ availableFrom: "2026-11-01", effectiveDate: "2026-10-01" })).toBe("Nov 1, 2026");
  });
});

describe("form checks", () => {
  const today = "2026-10-14";
  const ok = { kind: "VACATION" as const, startDate: "2026-10-20", endDate: "2026-10-22", reason: "Trip" };
  it("accepts a good entry and a single day with no end", () => {
    expect(blockProblem(ok, today)).toBeNull();
    expect(blockProblem({ ...ok, endDate: "" }, today)).toBeNull();
  });
  it("refuses bad entries before the API does", () => {
    expect(blockProblem({ ...ok, startDate: "" }, today)).toMatch(/start date/);
    expect(blockProblem({ ...ok, endDate: "2026-10-19" }, today)).toMatch(/can't be before/);
    expect(blockProblem({ ...ok, endDate: "2028-01-01" }, today)).toMatch(/at most 366/);
    expect(blockProblem({ ...ok, startDate: "2024-01-01", endDate: "2024-01-02" }, today)).toMatch(/within the last year/);
    expect(blockProblem({ ...ok, reason: "x".repeat(201) }, today)).toMatch(/200/);
  });
  it("checks the available-from date", () => {
    expect(fromDateProblem("", today)).toBeNull();
    expect(fromDateProblem("2026-10-14", today)).toBeNull();
    expect(fromDateProblem("2026-10-13", today)).toMatch(/today or a later/);
    expect(fromDateProblem("2030-01-01", today)).toMatch(/two years/);
  });
  const draft = (o: Partial<PrefDraft> = {}): PrefDraft => ({ workMode: "", noticeWeeks: "", rateMin: "", rateMax: "", rateNote: "", travelLabel: "", travelPercent: "", ...o });
  it("converts dollars to minor units", () => {
    expect(toMinor("110")).toBe(11000);
    expect(toMinor("110.5")).toBe(11050);
    expect(toMinor("")).toBeNull();
    expect(Number.isNaN(toMinor("abc"))).toBe(true);
    expect(Number.isNaN(toMinor("-5"))).toBe(true);
  });
  it("checks preferences and builds the request", () => {
    expect(prefProblem(draft())).toBeNull();
    expect(prefProblem(draft({ noticeWeeks: "27" }))).toMatch(/0 and 26/);
    expect(prefProblem(draft({ rateMin: "150", rateMax: "100" }))).toMatch(/can't be above/);
    expect(prefProblem(draft({ rateMin: "abc" }))).toMatch(/dollars/);
    expect(prefProblem(draft({ travelPercent: "20" }))).toMatch(/Choose how much/);
    expect(prefProblem(draft({ travelLabel: "OCCASIONAL", travelPercent: "120" }))).toMatch(/0 to 100/);
    expect(prefBody(draft({ workMode: "REMOTE", noticeWeeks: "2", rateMin: "110", rateMax: "140", travelLabel: "OCCASIONAL", travelPercent: "25", rateNote: " flexible " }))).toEqual({
      workMode: "REMOTE",
      noticeWeeks: 2,
      rateMinMinor: 11000,
      rateMaxMinor: 14000,
      rateNote: "flexible",
      travelLabel: "OCCASIONAL",
      travelPercent: 25,
    });
    expect(prefBody(draft({ travelLabel: "NONE", travelPercent: "40" })).travelPercent).toBe(0);
    expect(prefBody(draft()).workMode).toBeNull();
  });
});
