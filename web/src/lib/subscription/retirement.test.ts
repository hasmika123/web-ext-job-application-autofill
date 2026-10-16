import { describe, expect, it } from "vitest";
import { COPY, decisionLine, defaultLine, diffLine, isDearer, suggestLine, type RetirementNotice, type RetirementSuggestion } from "./retirement";
import { shortDate } from "./copy";

const AT = "2026-11-15T12:00:00Z";
const DATE = shortDate(AT);

const S = (over: Partial<RetirementSuggestion> = {}): RetirementSuggestion => ({
  successorPlanKey: "PRO",
  successorName: "Pro v3",
  interval: "MONTH",
  currency: "USD",
  currentMinor: 1999,
  proposedMinor: 1999,
  deltaMinor: 0,
  covers: [],
  gaps: [],
  atRenewalQuoteId: 1,
  ...over,
});

const N = (over: Partial<RetirementNotice> = {}): RetirementNotice => ({
  retirementId: 1,
  planKey: "PRO",
  planName: "Pro v1",
  effectiveAt: AT,
  defaultOutcome: "FREE",
  interval: "MONTH",
  currency: "USD",
  uses: [],
  suggestion: S(),
  others: [],
  fallback: { locked: [] },
  decision: { status: "PENDING" },
  ...over,
});

describe("retirement copy register (11 section 4.2)", () => {
  it("diff lines: same, lower and higher, formatted from minor units", () => {
    expect(diffLine(S())).toBe("same price, everything you use is included");
    expect(diffLine(S({ deltaMinor: -500 }))).toBe("$5.00 less per mo, everything you use is included");
    expect(diffLine(S({ deltaMinor: 2000 }))).toBe("$20.00 more per mo — we will never move you to a higher price without your say-so");
    expect(diffLine(S({ gaps: ["Priority support"] }))).toBe("same price, Priority support isn't included");
    expect(suggestLine(S())).toBe("Based on what you use, Pro v3 is the closest match: same price, everything you use is included.");
    expect(isDearer(S({ deltaMinor: 1 }))).toBe(true);
    expect(isDearer(S())).toBe(false);
  });

  it("the default line carries the date and the right outcome; it never mentions deletion as a consequence", () => {
    expect(defaultLine(N())).toContain(`on ${DATE} your account moves to Free`);
    expect(defaultLine(N())).toMatch(/Everything you made stays/);
    expect(defaultLine(N({ defaultOutcome: "MIGRATE_AT_RENEWAL" }))).toContain(`on ${DATE} we'll move you to Pro v3 at $19.99/mo (not more than you pay today)`);
    expect(defaultLine(N({ defaultOutcome: "CANCEL" }))).toContain(`your plan ends on ${DATE}`);
    for (const o of ["FREE", "MIGRATE_AT_RENEWAL", "CANCEL"] as const) expect(defaultLine(N({ defaultOutcome: o }))).not.toMatch(/deleted|lost|erased/i);
  });

  it("decision lines state the date and that it can be changed", () => {
    expect(decisionLine(N())).toBeNull();
    expect(decisionLine(N({ decision: { status: "SWITCH_SCHEDULED", planName: "Pro v3" } }))).toBe(`You chose Pro v3. It starts on ${DATE}. You can change this any time before then.`);
    expect(decisionLine(N({ decision: { status: "STAY_ON_FREE" } }))).toContain("You can change this any time before then.");
  });

  it("the banner, cancel and lock sentences", () => {
    expect(COPY.banner("Pro v1", AT)).toBe(`Pro v1 is changing on ${DATE}`);
    expect(COPY.cancel("Pro v1", AT)).toContain("No refunds for partial periods");
    expect(COPY.lockBanner(AT)).toBe(`Some services are read-only since ${DATE}. Your data is safe.`);
    expect(COPY.lockCard("Inbox monitoring")).toBe("Inbox monitoring is locked. Everything you made is here to read and download. Upgrade to use it again.");
  });
});
