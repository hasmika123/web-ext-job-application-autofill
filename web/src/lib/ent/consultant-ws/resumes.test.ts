import { describe, expect, it } from "vitest";
import { ACTIVITY_LABELS, changeText, escapeHtml, fileNameOf, parsePreview, parseResumes, resumeHtml, resumeText, sortResumes, verdictOf, type ResumePreview, type ResumeRow } from "./resumes";

const tile = (value: number, extra: Record<string, unknown> = {}) => ({ value, previous: 1, delta: value - 1, deltaPct: 33.3, sparkline: [0, 1, 2], ...extra });

const body = () => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  me: { consultantId: 1, name: "Anika Rao" },
  tiles: { totalResumes: tile(5), primary: { value: 1, title: "Technical Consultant Resume" }, totalViews: tile(24), totalDownloads: tile(12), timesShared: tile(8) },
  resumes: [
    { id: 1, title: "Technical Consultant Resume", targetRole: "General", primary: true, updatedAt: "2026-10-14T10:24:00Z", visibility: "PUBLIC", versionNo: 3, approvalStatus: "APPROVED" },
    { id: 2, title: "bad visibility", visibility: "SECRET" },
    { notARow: true },
  ],
  resumeStrength: { percent: 140, hasResume: true, checks: [{ key: "a", label: "A", done: true }, { key: 3 }] },
  improvements: [
    { key: "primary", title: "Choose a primary resume", hint: "h", action: "set-primary", href: null, resumeId: 4 },
    { key: "x", title: "no action" },
  ],
  recentActivity: [
    { kind: "VIEWED", resumeId: 1, resumeTitle: "Technical Consultant Resume", versionNo: 3, at: "2026-10-14T11:32:00Z" },
    { kind: "DELETED", resumeId: 1, resumeTitle: "x", versionNo: 1, at: "2026-10-14T11:32:00Z" },
  ],
});

const row = (over: Partial<ResumeRow>): ResumeRow => ({ id: 1, title: "A", targetRole: null, primary: false, updatedAt: "2026-10-01T00:00:00Z", visibility: "PUBLIC", versionNo: 1, approvalStatus: "APPROVED", ...over });

describe("parseResumes", () => {
  it("reads the contract and drops rows that are not the contract", () => {
    const v = parseResumes(body());
    expect(v).not.toBeNull();
    expect(v!.tiles.totalViews.value).toBe(24);
    expect(v!.tiles.primary).toEqual({ value: 1, title: "Technical Consultant Resume" });
    expect(v!.resumes.map((r) => r.id)).toEqual([1]);
    expect(v!.resumeStrength.percent).toBe(100);
    expect(v!.resumeStrength.checks).toHaveLength(1);
    expect(v!.improvements.map((i) => i.key)).toEqual(["primary"]);
    expect(v!.recentActivity.map((a) => a.kind)).toEqual(["VIEWED"]);
  });

  it("returns null when it is not the contract and never invents numbers", () => {
    expect(parseResumes(null)).toBeNull();
    expect(parseResumes({ orgId: "2" })).toBeNull();
    const v = parseResumes({ orgId: 1, me: {}, tiles: {} })!;
    expect(v.tiles.totalViews).toEqual({ value: 0, previous: null, delta: null, deltaPct: null, sparkline: [] });
    expect(v.resumes).toEqual([]);
  });
});

describe("parsePreview", () => {
  it("keeps the structured fields and drops junk", () => {
    const p = parsePreview({ id: 1, title: "T", name: "Anika", visibility: "WEIRD", skills: ["Java", 3, ""], experience: [{ title: "Dev", employer: "X", startYear: 2020, endYear: null }, "no"] })!;
    expect(p.visibility).toBe("INTERNAL");
    expect(p.skills).toEqual(["Java"]);
    expect(p.experience).toHaveLength(1);
    expect(parsePreview({ id: 1 })).toBeNull();
  });
});

describe("sortResumes", () => {
  const rows = [row({ id: 1, title: "Beta", updatedAt: "2026-10-01T00:00:00Z", versionNo: 2, visibility: "PRIVATE" }), row({ id: 2, title: "alpha", updatedAt: "2026-10-05T00:00:00Z", versionNo: 4, visibility: "PUBLIC" }), row({ id: 3, title: "Gamma", updatedAt: null, versionNo: 1, visibility: "INTERNAL" })];
  it("sorts by each key without mutating the input", () => {
    expect(sortResumes(rows, "updated").map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortResumes(rows, "title").map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortResumes(rows, "version").map((r) => r.id)).toEqual([2, 1, 3]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("orders visibility labels alphabetically (Private, Public, Team)", () => {
    expect(sortResumes(rows, "visibility").map((r) => r.visibility)).toEqual(["PRIVATE", "PUBLIC", "INTERNAL"]);
  });
});

describe("changeText", () => {
  it("formats percent and absolute changes, null when there is nothing to compare", () => {
    expect(changeText({ value: 24, previous: 18, delta: 6, deltaPct: 33.3, sparkline: [] }, "pct")).toEqual({ dir: "up", text: "+33%" });
    expect(changeText({ value: 24, previous: 18, delta: 6, deltaPct: 8.46, sparkline: [] }, "pct")).toEqual({ dir: "up", text: "+8.5%" });
    expect(changeText({ value: 1, previous: 2, delta: -1, deltaPct: -50, sparkline: [] }, "pct")).toEqual({ dir: "down", text: "-50%" });
    expect(changeText({ value: 5, previous: 5, delta: 0, deltaPct: 0, sparkline: [] }, "pct")).toEqual({ dir: "flat", text: "0%" });
    expect(changeText({ value: 5, previous: 4, delta: 1, deltaPct: 25, sparkline: [] }, "abs")).toEqual({ dir: "up", text: "+1" });
    expect(changeText({ value: 5, previous: 0, delta: 5, deltaPct: null, sparkline: [] }, "pct")).toBeNull();
    expect(changeText({ value: 5, previous: null, delta: null, deltaPct: null, sparkline: [] }, "abs")).toBeNull();
  });
});

describe("labels", () => {
  it("has a label for every activity kind and a verdict per strength band", () => {
    expect(Object.keys(ACTIVITY_LABELS)).toEqual(["VIEWED", "DOWNLOADED", "SHARED", "UPDATED"]);
    expect(verdictOf(78)).toMatch(/looking good/);
    expect(verdictOf(55)).toMatch(/getting there/);
    expect(verdictOf(10)).toMatch(/needs attention/);
  });
  it("makes a safe file name", () => {
    expect(fileNameOf("Technical Consultant Resume", "html")).toBe("technical-consultant-resume.html");
    expect(fileNameOf("///", "txt")).toBe("resume.txt");
  });
});

describe("printable output", () => {
  const p: ResumePreview = {
    id: 1,
    title: "T <b>",
    targetRole: null,
    versionNo: 2,
    visibility: "PUBLIC",
    updatedAt: null,
    name: "Anika <script>alert(1)</script> Rao",
    email: "a@example.org",
    jobTitle: "Engineer",
    headline: "Full Stack",
    summary: "Builds & ships.",
    skills: ["Java", "SQL"],
    experience: [{ title: "Lead", employer: "Acme", startYear: 2020, endYear: null }],
  };
  it("builds a plain-text resume from the structured fields", () => {
    const t = resumeText(p);
    expect(t).toContain("SUMMARY\nBuilds & ships.");
    expect(t).toContain("SKILLS\nJava, SQL");
    expect(t).toContain("Lead, Acme (2020 - Present)");
  });
  it("escapes everything in the HTML and has no script", () => {
    const h = resumeHtml(p);
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain("Builds &amp; ships.");
    expect(h).toContain("2020 - Present");
    expect(escapeHtml(`"'<&>`)).toBe("&quot;&#39;&lt;&amp;&gt;");
  });
});
