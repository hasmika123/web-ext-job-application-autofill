import { describe, expect, it } from "vitest";
import { actorText, expiryText, ownerLoginOf, recruiterLabel, typeLabel, versionChipLabel, versionKindChip, viewsText, visibilityLabel } from "./headerBar";
import { testMeta } from "./test-meta";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const DAYS = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

describe("headerBar words", () => {
  it("labels the type pill, the recruiter chip and the version chip", () => {
    expect(typeLabel("MASTER")).toBe("Master Resume");
    expect(typeLabel("TAILORED")).toBe("Tailored Resume");
    expect(recruiterLabel(false)).toBe("Shared with Recruiters: Off");
    expect(recruiterLabel(true, true)).toBe("Recruiters: On");
    expect(versionChipLabel(3)).toBe("Version 3");
    expect(versionChipLabel(3, true)).toBe("v3");
    expect(versionChipLabel(0)).toBe("No versions yet");
  });

  it("derives the visibility label People > Organization > Private", () => {
    const v = (mode: "PRIVATE" | "ORG" | "PEOPLE", people: number) => ({ mode, orgPaired: null, orgScope: null, shareWithOrg: true, people });
    expect(visibilityLabel(v("PEOPLE", 2))).toBe("Specific people (2)");
    expect(visibilityLabel(v("ORG", 0))).toBe("My organization");
    expect(visibilityLabel(v("PRIVATE", 0))).toBe("Private");
    expect(visibilityLabel(v("ORG", 1))).toBe("Specific people (1)");
  });

  it("words a link's expiry and views", () => {
    expect(expiryText(DAYS(23), false, NOW)).toBe("Expires in 23 days");
    expect(expiryText(DAYS(1), false, NOW)).toBe("Expires in 1 day");
    expect(expiryText(new Date(NOW + 3_600_000).toISOString(), false, NOW)).toBe("Expires in 1 day");
    expect(expiryText(new Date(NOW - 1000).toISOString(), false, NOW)).toBe("Expires today");
    expect(expiryText(null, false, NOW)).toBe("Never expires");
    expect(expiryText(DAYS(-3), true, NOW)).toBe("Expired");
    expect(viewsText(0)).toBe("No views yet");
    expect(viewsText(1)).toBe("1 view");
    expect(viewsText(12)).toBe("12 views");
  });

  it("calls the owner 'you' and others by name; a marketer-made resume names everyone", () => {
    const own = testMeta();
    expect(ownerLoginOf(own)).toBe("priya");
    expect(actorText({ login: "priya", label: "Priya Sharma" }, "priya")).toBe("you");
    expect(actorText({ login: "rahul", label: "Rahul" }, "priya")).toBe("Rahul");
    expect(actorText(null, "priya")).toBe("you");
    const madeByMarketer = testMeta({ source: { ...own.source, madeBy: "Rahul" }, createdBy: { login: "rahul", label: "Rahul" } });
    expect(ownerLoginOf(madeByMarketer)).toBeNull();
    expect(actorText({ login: "rahul", label: "Rahul" }, null)).toBe("Rahul");
    expect(ownerLoginOf(null)).toBeNull();
  });

  it("marks only the versions the person made on purpose", () => {
    expect(versionKindChip({ kind: "named" })).toBe("named");
    expect(versionKindChip({ kind: "checkpoint" })).toBe("saved");
    expect(versionKindChip({ kind: "auto" })).toBeNull();
    expect(versionKindChip({ kind: "system" })).toBeNull();
  });
});
