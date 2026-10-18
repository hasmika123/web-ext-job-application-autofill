import { describe, expect, it } from "vitest";
import { addDaysIso, canStartRetirement, effectiveDateProblem, isRetiring, parseNoticeDays, priceCheckText, startProblem, type SuccessorCoverage } from "./admin-retirements";

const NOW = new Date("2026-10-16T12:00:00Z");
const S = (over: Partial<SuccessorCoverage> = {}): SuccessorCoverage => ({ planKey: "PRO_STUDENT", name: "Pro Student", fullyCovered: 198, withGaps: 14, gapFeatures: [], wouldPayMore: 0, sellable: true, ...over });

describe("admin-retirements helpers", () => {
  it("computes the earliest allowed date and refuses one inside the minimum notice", () => {
    expect(addDaysIso(NOW, 30)).toBe("2026-11-15");
    expect(effectiveDateProblem("2026-11-14", 30, NOW)).toMatch(/at least 30 days/);
    expect(effectiveDateProblem("2026-11-15", 30, NOW)).toBeNull();
    expect(effectiveDateProblem("", 30, NOW)).toBeNull();
    expect(effectiveDateProblem("soon", 30, NOW)).toBe("Pick a valid date.");
  });

  it("parses notice days: whole numbers within bounds, descending, unique", () => {
    expect(parseNoticeDays("7, 60 30,1 30", 1, 120)).toEqual([60, 30, 7, 1]);
    expect(parseNoticeDays("", 1, 120)).toBeNull();
    expect(parseNoticeDays("0, 7", 1, 120)).toBeNull();
    expect(parseNoticeDays("7, 400", 1, 120)).toBeNull();
    expect(parseNoticeDays("7.5", 1, 120)).toBeNull();
  });

  it("states which plans can be retired", () => {
    expect(canStartRetirement("PUBLISHED")).toBe(true);
    expect(canStartRetirement("DRAFT")).toBe(false);
    expect(isRetiring("RETIRING")).toBe(true);
    expect(isRetiring("SUNSET")).toBe(true);
    expect(isRetiring("PUBLISHED")).toBe(false);
  });

  it("price check: Free is always fine; a successor that would charge anyone more is refused with the count", () => {
    expect(priceCheckText("FREE", undefined).ok).toBe(true);
    expect(priceCheckText("MIGRATE_AT_RENEWAL", undefined).ok).toBe(false);
    const dear = priceCheckText("MIGRATE_AT_RENEWAL", S({ wouldPayMore: 9 }));
    expect(dear.ok).toBe(false);
    expect(dear.text).toMatch(/9 subscribers would pay more under Pro Student/);
    expect(priceCheckText("MIGRATE_AT_RENEWAL", S({ wouldPayMore: 1 })).text).toMatch(/1 subscriber would/);
    expect(priceCheckText("MIGRATE_AT_RENEWAL", S()).ok).toBe(true);
  });

  it("startProblem names the first thing that blocks Start", () => {
    const ok = { outcome: "FREE" as const, firstSuccessor: undefined, successorCount: 0, noticeDays: [60, 30], channels: ["EMAIL" as const], dateProblem: null, reason: "x".repeat(20), reasonMin: 20, typed: "PRO", planKey: "PRO" };
    expect(startProblem(ok)).toBeNull();
    expect(startProblem({ ...ok, outcome: "MIGRATE_AT_RENEWAL" })).toBe("Add at least one successor.");
    expect(startProblem({ ...ok, outcome: "MIGRATE_AT_RENEWAL", successorCount: 1, firstSuccessor: S({ wouldPayMore: 2 }) })).toMatch(/would pay more/);
    expect(startProblem({ ...ok, noticeDays: null })).toBe("Fix the notice days.");
    expect(startProblem({ ...ok, channels: [] })).toBe("Pick at least one channel.");
    expect(startProblem({ ...ok, reason: "short" })).toMatch(/at least 20/);
    expect(startProblem({ ...ok, typed: "pro" })).toBe("Type PRO to confirm.");
  });
});
