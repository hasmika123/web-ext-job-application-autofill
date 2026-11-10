import { describe, expect, it } from "vitest";
import { CATALOG, SUB } from "./fixtures";
import { carryAddons, changeProblemCopy, changeRequest, currentTarget, effectiveQuantity, offerableAddons, pendingFor, sameTarget } from "./plan-state";

describe("plan-state", () => {
  it("counts a scheduled removal as zero and a scheduled decrease as its new quantity", () => {
    expect(effectiveQuantity({ quantity: 2 })).toBe(2);
    expect(effectiveQuantity({ quantity: 2, endsAt: "2026-11-15T00:00:00Z" })).toBe(0);
    expect(effectiveQuantity({ quantity: 3, pendingQuantity: 1 })).toBe(1);
  });

  it("reads what is held as a target, and nothing for a Free or unlinked subscriber", () => {
    expect(currentTarget(SUB)).toEqual({ planKey: "PRO", interval: "MONTH", addons: { "ai.credits_extra": 2 } });
    expect(currentTarget({ plan: "FREE", status: "none", currentPeriodEnd: null, cancelAtPeriodEnd: false, billingEnabled: true, hasCustomer: false })).toBeNull();
    const removed = { ...SUB, addons: [{ featureKey: "ai.credits_extra", name: "x", quantity: 2, endsAt: "2026-11-15T00:00:00Z" }] };
    expect(currentTarget(removed)?.addons).toEqual({});
  });

  it("compares targets by value", () => {
    const a = { planKey: "PRO", interval: "MONTH" as const, addons: { x: 1 } };
    expect(sameTarget(a, { ...a, addons: { x: 1, y: 0 } })).toBe(true);
    expect(sameTarget(a, { ...a, addons: { x: 2 } })).toBe(false);
    expect(sameTarget(a, { ...a, interval: "YEAR" })).toBe(false);
    expect(sameTarget(a, { ...a, planKey: "AUTOPILOT" })).toBe(false);
  });

  it("builds the CHANGE request as the TARGET add-on set, naming plan and interval only when they change", () => {
    const cur = currentTarget(SUB)!;
    expect(changeRequest({ ...cur, addons: { "ai.credits_extra": 1, "resumes.extra_10": 0 } }, cur)).toEqual({
      kind: "CHANGE",
      addons: [{ featureKey: "ai.credits_extra", quantity: 1 }],
    });
    expect(changeRequest({ ...cur, interval: "YEAR" }, cur)).toMatchObject({ interval: "YEAR" });
    expect(changeRequest({ ...cur, planKey: "AUTOPILOT" }, cur)).toMatchObject({ planKey: "AUTOPILOT" });
  });

  it("finds a scheduled change that can still be undone", () => {
    const withPending = { ...SUB, pendingChanges: [{ id: 51, kind: "DECREASE", featureKey: "ai.credits_extra", status: "PENDING" }] };
    expect(pendingFor(withPending, "ai.credits_extra")?.id).toBe(51);
    expect(pendingFor(SUB, "ai.credits_extra")).toBeUndefined();
  });

  it("carries only the add-ons the new plan offers at the interval", () => {
    const pro = CATALOG.plans[1];
    expect(offerableAddons(pro, "YEAR").map((o) => o.featureKey)).toEqual(["ai.credits_extra"]);
    const { kept, dropped } = carryAddons({ "ai.credits_extra": 2, "resumes.extra_10": 1 }, pro, "YEAR");
    expect(kept).toEqual({ "ai.credits_extra": 2 });
    expect(dropped).toEqual(["resumes.extra_10"]);
  });

  it("separates 'nothing to show', 'special sentence' and 'use the general register'", () => {
    expect(changeProblemCopy("NO_CHANGE")).toBeNull();
    expect(changeProblemCopy("PLAN_SWITCH_UNSUPPORTED")).toMatch(/Manage billing/);
    expect(changeProblemCopy("SOMETHING_ELSE")).toBeUndefined();
  });
});
