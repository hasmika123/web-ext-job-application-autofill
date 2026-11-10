import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkMonth,
  checkText,
  fetchProfile,
  initialsOf,
  monthYear,
  addSkill,
  parseProfile,
  saveEmploymentTypes,
  completenessLine,
  yearsRange,
  yearsText,
} from "./profile";

const body = (over: Record<string, unknown> = {}) => ({
  orgId: 4,
  me: { consultantId: 9, name: "Anika Rao", jobTitle: "Senior Java Developer", yearsExperience: 8, location: "San Jose, CA", workMode: null },
  availability: { status: "NOTICE", since: "2026-10-01", availableFrom: "2026-11-15" },
  strength: { percent: 78, missing: [{ key: "goals", label: "Set your career goals", section: "goals" }, { bad: true }] },
  summary: { text: "Seasoned.", source: "RESUME", hasResume: true },
  skills: [{ id: 1, skill: "Java", primary: true }, { id: "x", skill: "bad" }],
  certifications: [{ id: 2, name: "CSM", issuer: "Scrum Alliance", issuedOn: "2020-08-01" }, { id: 3 }],
  experience: { resumeName: "Main", items: [{ id: 5, title: "Dev", employer: "Acme", startYear: 2021, endYear: null }] },
  preferences: { roles: [{ id: 6, value: "Backend" }], locations: [], employmentTypes: ["CONTRACT", "FREELANCE"] },
  workAuthorization: "AUTHORIZED_NO_SPONSORSHIP",
  careerGoals: "Lead a team.",
  ...over,
});

describe("parseProfile", () => {
  it("reads the contract and drops rows that do not match", () => {
    const v = parseProfile(body())!;
    expect(v.me.name).toBe("Anika Rao");
    expect(v.availability.status).toBe("NOTICE");
    expect(v.strength.percent).toBe(78);
    expect(v.strength.missing).toEqual([{ key: "goals", label: "Set your career goals", section: "goals" }]);
    expect(v.skills).toEqual([{ id: 1, skill: "Java", primary: true }]);
    expect(v.certifications).toHaveLength(1);
    expect(v.experience.items[0].endYear).toBeNull();
    expect(v.preferences.employmentTypes).toEqual(["CONTRACT"]);
    expect(v.workAuthorization).toBe("AUTHORIZED_NO_SPONSORSHIP");
  });

  it("rejects non-contract bodies and tolerates missing blocks without inventing values", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile({ orgId: "x" })).toBeNull();
    const v = parseProfile({ orgId: 1, me: { consultantId: 1, name: "A" } })!;
    expect(v.skills).toEqual([]);
    expect(v.summary).toEqual({ text: null, source: "NONE", hasResume: false });
    expect(v.workAuthorization).toBeNull();
    expect(v.careerGoals).toBeNull();
    expect(v.strength).toEqual({ percent: 0, missing: [] });
  });

  it("does not accept an unknown work-authorization or availability value", () => {
    const v = parseProfile(body({ workAuthorization: "H1B 123456", availability: { status: "BUSY" } }))!;
    expect(v.workAuthorization).toBeNull();
    expect(v.availability.status).toBe("AVAILABLE");
  });

  it("clamps the percent", () => {
    expect(parseProfile(body({ strength: { percent: 250, missing: [] } }))!.strength.percent).toBe(100);
    expect(parseProfile(body({ strength: { percent: -4, missing: [] } }))!.strength.percent).toBe(0);
  });
});

describe("helpers", () => {
  it("formats years of experience and ranges", () => {
    expect(yearsText(8)).toBe("8+ years");
    expect(yearsText(5)).toBe("5 years");
    expect(yearsText(1)).toBe("1 year");
    expect(yearsText(null)).toBeNull();
    expect(yearsRange(2021, null)).toBe("2021 – Present");
    expect(yearsRange(2018, 2020)).toBe("2018 – 2020");
    expect(yearsRange(2019, 2019)).toBe("2019");
    expect(yearsRange(null, null)).toBe("");
  });

  it("words the completeness line and formats months and initials", () => {
    expect(completenessLine(100, [])).toBe("Profile complete");
    expect(completenessLine(83, [{ label: "Add a summary statement" }, { label: "Add certifications" }])).toBe("Profile 83% complete: add a summary statement");
    expect(completenessLine(0, [{ label: "Key skills" }])).toBe("Profile 0% complete: key skills");
    expect(monthYear("2023-03-01")).toBe("Mar 2023");
    expect(monthYear(null)).toBe("");
    expect(initialsOf("Anika Rao")).toBe("AR");
    expect(initialsOf("Cher")).toBe("CH");
    expect(initialsOf("  ")).toBe("?");
  });

  it("validates text and months like the API does", () => {
    expect(checkText("  ", 10)).toBe("Enter a value.");
    expect(checkText("  ", 10, false)).toBeNull();
    expect(checkText("x".repeat(11), 10)).toMatch(/at most 10/);
    expect(checkText("<b>", 10)).toMatch(/Angle/);
    expect(checkText("Java", 10)).toBeNull();
    const now = new Date("2026-10-13T00:00:00Z");
    expect(checkMonth("", now)).toBeNull();
    expect(checkMonth("2023-03", now)).toBeNull();
    expect(checkMonth("2026-10", now)).toBeNull();
    expect(checkMonth("2026-11", now)).toMatch(/passed/);
    expect(checkMonth("March", now)).toMatch(/Pick a month/);
    expect(checkMonth("2023-13", now)).toMatch(/valid/);
  });
});

describe("calls", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status }));

  it("maps statuses: ok, denied, invalid (with the PII flag) and failed", async () => {
    vi.stubGlobal("fetch", reply(200, body()));
    expect((await fetchProfile(4)).kind).toBe("OK");
    vi.stubGlobal("fetch", reply(404, { code: "NOT_FOUND" }));
    expect((await fetchProfile(4)).kind).toBe("DENIED");
    vi.stubGlobal("fetch", reply(422, { error: "We never store a Social Security number", code: "SENSITIVE_CONTENT" }));
    expect(await addSkill(4, "x")).toEqual({ kind: "INVALID", message: "We never store a Social Security number", sensitive: true });
    vi.stubGlobal("fetch", reply(500, {}));
    expect((await fetchProfile(4)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", reply(200, { nope: 1 }));
    expect((await fetchProfile(4)).kind).toBe("FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("net"))));
    expect((await fetchProfile(4)).kind).toBe("FAILED");
  });

  it("sends the write to the right path with a JSON body", async () => {
    const f = reply(200, body());
    vi.stubGlobal("fetch", f);
    await saveEmploymentTypes(4, ["CONTRACT", "FULL_TIME"]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/4/me-workspace/profile/employment-types");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ values: ["CONTRACT", "FULL_TIME"] });
  });
});
