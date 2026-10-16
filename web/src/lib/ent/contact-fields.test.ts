import { describe, expect, it } from "vitest";
import { checkPhone, preferredLabel, timeZoneLabel } from "./contact-fields";

describe("consultant contact fields", () => {
  it("accepts a fictional phone and a blank, refuses letters and wrong lengths", () => {
    expect(checkPhone("(555) 010-0142")).toBeNull();
    expect(checkPhone("+1 555 010 0142")).toBeNull();
    expect(checkPhone("   ")).toBeNull();
    expect(checkPhone("call me")).not.toBeNull();
    expect(checkPhone("12345")).not.toBeNull();
    expect(checkPhone("1".repeat(16))).not.toBeNull();
  });

  it("labels the preferred contact and the zone, and falls back to the raw id", () => {
    expect(preferredLabel("TEXT")).toBe("Text message");
    expect(preferredLabel("NOPE")).toBeNull();
    expect(timeZoneLabel("America/Chicago")).toBe("Central (Chicago)");
    expect(timeZoneLabel("Europe/Paris")).toBe("Europe/Paris");
    expect(timeZoneLabel("")).toBeNull();
  });
});
