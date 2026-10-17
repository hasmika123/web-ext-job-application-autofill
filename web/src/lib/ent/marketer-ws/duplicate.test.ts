import { describe, expect, it } from "vitest";
import { ASSIGNMENT_CAP, DUPLICATE_BLOCKED, DUPLICATE_REASON_MAX, DUPLICATE_WARNING, confirmFields, findingsOf, isDuplicateWarning, plainRefusal, reasonOk } from "./duplicate";

describe("the duplicate guard helpers shared by the marketing flows", () => {
  it("a confirmation is the two body fields, and no confirmation adds nothing", () => {
    expect(confirmFields({ reason: "Both vendors asked" })).toEqual({ confirmDuplicate: true, duplicateReason: "Both vendors asked" });
    expect(confirmFields()).toEqual({});
  });

  it("keeps only findings that carry a message", () => {
    expect(findingsOf([{ rule: "SAME_JOB", message: "Same role." }, { rule: "x" }, "junk", null, { message: "No rule" }])).toEqual([
      { rule: "SAME_JOB", message: "Same role." },
      { rule: "", message: "No rule" },
    ]);
    expect(findingsOf("nope")).toEqual([]);
    expect(findingsOf(undefined)).toEqual([]);
  });

  it("only a warning can be confirmed; a block and the open limit cannot", () => {
    expect(isDuplicateWarning({ code: DUPLICATE_WARNING })).toBe(true);
    expect(isDuplicateWarning({ code: DUPLICATE_BLOCKED })).toBe(false);
    expect(isDuplicateWarning({ code: ASSIGNMENT_CAP })).toBe(false);
    expect(isDuplicateWarning({ code: null })).toBe(false);
  });

  it("a refusal keeps the API's own sentence, with a plain fallback only when it sent none", () => {
    expect(plainRefusal({ code: DUPLICATE_BLOCKED, error: "Already has it. Your organization does not allow this." })).toBe("Already has it. Your organization does not allow this.");
    expect(plainRefusal({ code: DUPLICATE_BLOCKED, error: "" })).toMatch(/does not allow that/);
    expect(plainRefusal({ code: ASSIGNMENT_CAP, error: "  " })).toMatch(/most open opportunities your organization allows/);
    expect(plainRefusal({ code: null, error: "" })).toBe("That didn't work. Nothing has changed.");
  });

  it("a reason is valid with text and within 200 characters", () => {
    expect(reasonOk("")).toBe(false);
    expect(reasonOk("   ")).toBe(false);
    expect(reasonOk("The client asked for both")).toBe(true);
    expect(reasonOk("x".repeat(DUPLICATE_REASON_MAX))).toBe(true);
    expect(reasonOk("x".repeat(DUPLICATE_REASON_MAX + 1))).toBe(false);
  });
});
