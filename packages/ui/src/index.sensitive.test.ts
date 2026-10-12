import { describe, expect, it } from "vitest";
import { redactSensitive, scanSensitive, SENSITIVE_LABELS } from "./index";

describe("@kiwiply/ui barrel: sensitive-patterns", () => {
  it("exposes the never-collected detector under its tagged names", () => {
    const hits = scanSensitive("SSN 123-45-6789");
    expect(hits).toHaveLength(1);
    expect(hits[0].cls).toBe("SSN_ITIN");
    expect(redactSensitive("SSN 123-45-6789")).toBe("SSN [removed]");
    expect(SENSITIVE_LABELS.DOB).toBe("a date of birth");
  });
});
