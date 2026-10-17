import { describe, expect, it } from "vitest";
import { deadlineText, errorSentence, offerListParams, offerViewParams, packageText, parseOfferView, showingText, termText, toMinor, DEFAULT_OFFER_VIEW, STATE_LABEL, type OfferRow } from "./offers";
import { parseSubmissionView, showingText as subShowing, submissionViewParams } from "./submissions-records";

const row = (over: Partial<OfferRow> = {}): OfferRow => ({
  id: 1,
  consultant: { id: 1, name: "Casey One", initials: "CO" },
  clientId: 2,
  clientName: "Acme Corp",
  roleTitle: "Platform Engineer",
  state: "EXTENDED",
  stateLabel: "Extended",
  placementType: "CONTRACT",
  rateMinor: 9500,
  ratePeriod: "HOUR",
  currency: "USD",
  baseSalaryMinor: null,
  totalCompMinor: null,
  workMode: "REMOTE",
  startDate: "2026-11-01",
  endDate: null,
  termMonths: null,
  deadline: "2026-10-30",
  daysLeft: 3,
  placementId: null,
  createdAt: "2026-10-16T10:00:00Z",
  extendedAt: "2026-10-16T10:00:00Z",
  respondedAt: null,
  sampleData: false,
  ...over,
});

describe("offer display helpers", () => {
  it("writes the package from the recorded numbers, with an honest dash when none is recorded", () => {
    expect(packageText(row())).toBe("$95/hr");
    expect(packageText(row({ rateMinor: 9550 }))).toBe("$95.5/hr");
    expect(packageText(row({ rateMinor: null, baseSalaryMinor: 14_000_000 }))).toBe("$140,000/yr");
    expect(packageText(row({ rateMinor: 12000, ratePeriod: "DAY", currency: "EUR" }))).toBe("EUR 120/day");
    expect(packageText(row({ rateMinor: null, baseSalaryMinor: null }))).toBe("—");
  });

  it("describes the term from the end date, the months, or just the start", () => {
    expect(termText(row({ endDate: "2027-05-01" }))).toBe("Nov 1, 2026 to May 1, 2027");
    expect(termText(row({ termMonths: 6 }))).toBe("Nov 1, 2026, 6 months");
    expect(termText(row({ termMonths: 1 }))).toBe("Nov 1, 2026, 1 month");
    expect(termText(row())).toBe("Nov 1, 2026");
    expect(termText(row({ startDate: null }))).toBe("Start date not set");
  });

  it("words the deadline only as a countdown while the offer is waiting on the consultant", () => {
    expect(deadlineText(row({ daysLeft: 0 }))).toBe("Answer due today");
    expect(deadlineText(row({ daysLeft: 1 }))).toBe("Answer due tomorrow");
    expect(deadlineText(row({ daysLeft: 5 }))).toBe("Answer due in 5 days");
    expect(deadlineText(row({ state: "ACCEPTED", daysLeft: null }))).toBe("Deadline Oct 30, 2026");
    expect(deadlineText(row({ deadline: null }))).toBe("");
  });

  it("turns typed amounts into minor units and refuses junk", () => {
    expect(toMinor("95")).toBe(9500);
    expect(toMinor("95.5")).toBe(9550);
    expect(toMinor("1,250.25")).toBe(125025);
    expect(toMinor("")).toBeNull();
    expect(Number.isNaN(toMinor("abc"))).toBe(true);
    expect(Number.isNaN(toMinor("-5"))).toBe(true);
    expect(Number.isNaN(toMinor("1.234"))).toBe(true);
  });

  it("labels all seven states and counts rows", () => {
    expect(Object.values(STATE_LABEL)).toEqual(["Draft", "Extended", "Negotiating", "Accepted", "Declined", "Expired", "Withdrawn"]);
    expect(showingText(0, 0, 10, 0)).toBe("No offers");
    expect(showingText(1, 0, 10, 1)).toBe("1-1 of 1 offer");
    expect(showingText(25, 1, 10, 10)).toBe("11-20 of 25 offers");
  });

  it("explains refusals in plain words", () => {
    expect(errorSentence({ status: 404, message: "x" })).toBe("This offer is no longer in your view.");
    expect(errorSentence({ status: 409, code: "OFFER_NOT_EDITABLE", message: "x" })).toBe("This offer can no longer be edited.");
    expect(errorSentence({ status: 422, code: "PLACEMENT_NOT_CREATED", message: "Link a client to this offer to create the placement." })).toBe("Link a client to this offer to create the placement.");
    expect(errorSentence({ status: 0, message: "offline" })).toBe("offline");
  });
});

describe("the offers URL state", () => {
  it("round-trips the view and falls back on junk", () => {
    const v = parseOfferView(new URLSearchParams("tab=accepted&q=ana&page=3&of=17"));
    expect(v).toMatchObject({ tab: "accepted", q: "ana", page: 2, selected: 17 });
    expect(new URLSearchParams(offerViewParams(v)).get("page")).toBe("3");
    expect(offerViewParams(DEFAULT_OFFER_VIEW)).toBe("");
    expect(parseOfferView(new URLSearchParams("tab=nope&page=-4&of=zzz"))).toMatchObject({ tab: "open", page: 0, selected: null });
  });

  it("sends a search only from two characters", () => {
    expect(offerListParams({ ...DEFAULT_OFFER_VIEW, q: "a" })).not.toContain("q=");
    expect(offerListParams({ ...DEFAULT_OFFER_VIEW, q: "ana" })).toContain("q=ana");
    expect(offerListParams({ ...DEFAULT_OFFER_VIEW, tab: "draft", page: 2 })).toBe("tab=draft&page=2&size=10");
  });
});

describe("the submissions records URL state", () => {
  it("keeps only a known status and a positive page", () => {
    expect(parseSubmissionView(new URLSearchParams("status=SUBMITTED&page=2&q=x"))).toEqual({ status: "SUBMITTED", q: "x", page: 1 });
    expect(parseSubmissionView(new URLSearchParams("status=NOPE&page=0"))).toEqual({ status: "", q: "", page: 0 });
    expect(submissionViewParams({ status: "REJECTED", q: "", page: 0 })).toBe("status=REJECTED");
    expect(subShowing(0, 0, 10, 0)).toBe("No submissions");
  });
});
