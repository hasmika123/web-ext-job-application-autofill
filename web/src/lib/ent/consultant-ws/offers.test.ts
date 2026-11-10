import { describe, expect, it } from "vitest";
import {
  ACCEPT_COPY,
  MAX_COMPARE,
  comparedRows,
  compareLabel,
  dateLabel,
  deadlineInfo,
  formatMoney,
  isDefaultQuery,
  noteProblem,
  parseOfferDetail,
  parseOffers,
  parseRow,
  queryString,
  rangeText,
  relativeTime,
  statusInfo,
  toggleSelection,
  workModeInfo,
  EMPTY_QUERY,
  type OfferRow,
} from "./offers";

const row = (o: Record<string, unknown> = {}) => ({
  id: 1, company: "CloudWave", role: "Senior Software Engineer", packageSummary: "$145K base + 15% bonus + equity", workMode: "REMOTE", startDate: "2025-01-13",
  offerDeadline: "2024-10-25", daysLeft: 5, status: "PENDING_REVIEW", baseSalaryMinor: 14_500_000, totalCompMinor: 16_675_000, currency: "USD", respondedAt: null, createdAt: "2024-10-01T00:00:00Z", sample: true, ...o,
});
const tile = (value: number) => ({ value, previous: 1, deltaPct: null, sparkline: [0, 1, 2, 3, 4, value], vs: "month" });

describe("money in minor units", () => {
  it("formats whole dollars, cents and missing figures without float maths", () => {
    expect(formatMoney(14_500_000)).toBe("$145,000");
    expect(formatMoney(16_675_000)).toBe("$166,750");
    expect(formatMoney(123_450)).toBe("$1,234.50");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(null)).toBe("-");
    expect(formatMoney(Number.NaN)).toBe("-");
    expect(formatMoney(-250_000)).toBe("-$2,500");
  });
  it("uses the offer's own currency", () => {
    expect(formatMoney(10_000_000, "EUR")).toBe("€100,000");
    expect(formatMoney(10_000_000, "XXX1")).toContain("100,000");
  });
});

describe("dates and deadlines", () => {
  it("formats a yyyy-mm-dd date without a time zone shift", () => {
    expect(dateLabel("2025-01-13")).toBe("Jan 13, 2025");
    expect(dateLabel("2024-12-02")).toBe("Dec 2, 2024");
    expect(dateLabel(null)).toBe("-");
    expect(dateLabel("soon")).toBe("-");
  });
  it("shows days left for open offers, coral from 14 days down", () => {
    expect(deadlineInfo({ offerDeadline: "2024-10-25", daysLeft: 5, status: "PENDING_REVIEW" })).toEqual({ date: "Oct 25, 2024", left: "(5 days left)", urgent: true });
    expect(deadlineInfo({ offerDeadline: "2024-10-26", daysLeft: 1, status: "NEGOTIATION" }).left).toBe("(1 day left)");
    expect(deadlineInfo({ offerDeadline: "2024-10-25", daysLeft: 0, status: "PENDING_REVIEW" }).left).toBe("(due today)");
    expect(deadlineInfo({ offerDeadline: "2024-12-25", daysLeft: 40, status: "PENDING_REVIEW" })).toMatchObject({ left: "(40 days left)", urgent: false });
  });
  it("shows no countdown on a closed offer", () => {
    expect(deadlineInfo({ offerDeadline: "2024-10-20", daysLeft: null, status: "DECLINED" })).toEqual({ date: "Oct 20, 2024", left: null, urgent: false });
    expect(deadlineInfo({ offerDeadline: "2024-10-20", daysLeft: null, status: "EXPIRED" }).urgent).toBe(true);
  });
  it("words the age of an event", () => {
    const now = Date.parse("2024-10-10T12:00:00Z");
    expect(relativeTime("2024-10-10T10:00:00Z", now)).toBe("2 hours ago");
    expect(relativeTime("2024-10-09T12:00:00Z", now)).toBe("1 day ago");
    expect(relativeTime("2024-10-05T12:00:00Z", now)).toBe("5 days ago");
    expect(relativeTime("2024-10-10T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("nonsense", now)).toBe("");
  });
});

describe("parsers", () => {
  it("reads a row and drops what is not the contract", () => {
    expect(parseRow(row())?.workMode).toBe("REMOTE");
    expect(parseRow(row({ status: "WEIRD" }))).toBeNull();
    expect(parseRow({ id: "1" })).toBeNull();
    expect(parseRow(row({ workMode: "MARS", currency: "usd" }))).toMatchObject({ workMode: null, currency: "USD" });
  });
  it("reads the page and the detail, never inventing numbers", () => {
    const view = parseOffers({
      orgId: 2, generatedAt: "2024-10-10T00:00:00Z", name: "Anika",
      tiles: { total: tile(5), pending: tile(2), accepted: tile(1), negotiation: tile(1), declined: tile(1) },
      offers: { items: [row(), { nope: true }], page: 0, size: 10, total: 1, totalPages: 1 },
      compare: [row()], activity: [{ offerId: 1, kind: "RECEIVED", label: "New offer received", company: "CloudWave", role: "Dev", occurredAt: "2024-10-10T00:00:00Z" }, { bad: 1 }], companies: ["CloudWave", 3],
    });
    expect(view?.offers.items).toHaveLength(1);
    expect(view?.activity).toHaveLength(1);
    expect(view?.companies).toEqual(["CloudWave"]);
    expect(view?.tiles.total.value).toBe(5);
    expect(parseOffers({ orgId: 2 })).toBeNull();
    expect(parseOffers({ orgId: 2, tiles: {}, offers: {} })).toBeNull();
    const d = parseOfferDetail({ row: row(), benefitsSummary: "Health", responseNote: null, events: [{ kind: "RECEIVED", label: "New offer received", occurredAt: "2024-10-10T00:00:00Z" }], canRespond: true, canNegotiate: false });
    expect(d?.canRespond).toBe(true);
    expect(d?.canNegotiate).toBe(false);
    expect(d?.events).toHaveLength(1);
    expect(parseOfferDetail({ row: { id: 1 } })).toBeNull();
  });
});

describe("status, work mode, query", () => {
  it("labels", () => {
    expect(statusInfo("PENDING_REVIEW")).toEqual({ label: "Pending Review", tone: "amber" });
    expect(statusInfo("NEGOTIATION").label).toBe("Negotiation");
    expect(statusInfo("EXPIRED").tone).toBe("slate");
    expect(workModeInfo("HYBRID")?.label).toBe("Hybrid");
    expect(workModeInfo(null)).toBeNull();
  });
  it("builds the query the API takes and knows the default", () => {
    expect(queryString(EMPTY_QUERY)).toBe("page=0&size=10");
    expect(queryString({ ...EMPTY_QUERY, status: "ACCEPTED", company: "Next Gen", q: " dev ", sort: "deadline", page: 2 })).toBe("status=ACCEPTED&company=Next+Gen&q=dev&sort=deadline&page=2&size=10");
    expect(queryString({ ...EMPTY_QUERY, size: 500 })).toContain("size=50");
    expect(isDefaultQuery(EMPTY_QUERY)).toBe(true);
    expect(isDefaultQuery({ ...EMPTY_QUERY, q: "x" })).toBe(false);
    expect(isDefaultQuery({ ...EMPTY_QUERY, page: 1 })).toBe(false);
    expect(rangeText({ page: 1, size: 10, total: 12 }, 2)).toBe("Showing 11-12 of 12");
    expect(rangeText({ page: 0, size: 10, total: 0 }, 0)).toBe("");
  });
});

describe("compare selection", () => {
  it("allows three, reports the cap, and removes freely", () => {
    expect(MAX_COMPARE).toBe(3);
    let sel: number[] = [];
    for (const id of [1, 2, 3]) sel = toggleSelection(sel, id).next;
    expect(sel).toEqual([1, 2, 3]);
    expect(toggleSelection(sel, 4)).toEqual({ next: [1, 2, 3], capped: true });
    expect(toggleSelection(sel, 2)).toEqual({ next: [1, 3], capped: false });
  });
  it("keeps the order chosen and drops vanished offers", () => {
    const all = [parseRow(row({ id: 1 })), parseRow(row({ id: 2, company: "B" })), parseRow(row({ id: 3, company: "C" }))] as OfferRow[];
    expect(comparedRows(all, [3, 1, 99]).map((r) => r.id)).toEqual([3, 1]);
    expect(compareLabel(2)).toBe("Compare Selected (2)");
  });
});

describe("note rules", () => {
  it("negotiate needs 3 to 300 characters, decline may be empty", () => {
    expect(noteProblem("", true)).toMatch(/at least 3/);
    expect(noteProblem("ab", true)).toMatch(/at least 3/);
    expect(noteProblem("abc", true)).toBeNull();
    expect(noteProblem("x".repeat(301), true)).toMatch(/300/);
    expect(noteProblem("   ", false)).toBeNull();
    expect(noteProblem("a", false)).toMatch(/at least 3/);
  });
});

describe("ACCEPT_COPY", () => {
  it("says that accepting starts the placement (the accept creates it) and that nothing is signed or paid", () => {
    expect(ACCEPT_COPY).toMatch(/starts your placement/);
    expect(ACCEPT_COPY).not.toMatch(/no placement is started/i);
    expect(ACCEPT_COPY).toMatch(/Nothing is signed/);
  });
});
