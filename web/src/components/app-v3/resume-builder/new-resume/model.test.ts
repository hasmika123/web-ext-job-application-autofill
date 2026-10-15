import { describe, expect, it } from "vitest";
import type { StructuredResume } from "@kiwiply/ui";
import type { Completeness, ProfileItem } from "@/lib/profile-items";
import {
  NOTHING_UNTICKED,
  buildPayload,
  capNotice,
  copyDescription,
  defaultName,
  foundSentence,
  itemOfPath,
  keepMaskOf,
  profileDescription,
  removedLine,
  reviewCounts,
  stripExtension,
  summarizeProfile,
} from "./model";

const item = (section: ProfileItem["section"], data: ProfileItem["data"] = {}, hidden = false): ProfileItem => ({
  id: Math.floor(Math.random() * 1_000_000),
  section,
  position: 0,
  data,
  provenance: "USER",
  sourceResumeId: null,
  hidden,
  updatedAt: null,
});

const completeness = (score: number): Completeness => ({ score, parts: {}, nextAction: null });

describe("summarizeProfile / profileDescription", () => {
  it("counts roles, schools and skills (not groups) from the live items", () => {
    const p = summarizeProfile(
      [item("EXPERIENCE"), item("EXPERIENCE"), item("EXPERIENCE"), item("EDUCATION"), item("EDUCATION"), item("SKILL", { skills: ["a", "b", "c"] }), item("SKILL", { skills: ["d"] }), item("EXPERIENCE", {}, true)],
      completeness(77.6),
      "  Backend Engineer ",
    );
    expect(p).toEqual({ itemCount: 7, roles: 3, schools: 2, skills: 4, score: 78, headline: "Backend Engineer" });
    expect(profileDescription(p)).toBe("Your saved profile: 3 roles · 2 schools · 4 skills · 78% complete");
  });

  it("singulars, a missing meter, and the empty profile", () => {
    const one = summarizeProfile([item("EXPERIENCE"), item("EDUCATION"), item("SKILL", { skills: ["x"] })], null);
    expect(profileDescription(one)).toBe("Your saved profile: 1 role · 1 school · 1 skill");
    const none = summarizeProfile([], null);
    expect(none.itemCount).toBe(0);
    expect(profileDescription(none)).toBe("Your profile is empty");
  });
});

describe("copy and review sentences", () => {
  it("copyDescription", () => {
    expect(copyDescription(4)).toBe("Start from one of your 4 resumes");
    expect(copyDescription(1)).toBe("Start from one of your 1 resume");
    expect(copyDescription(0)).toBe("You don't have a resume to copy yet");
  });

  const s = (over: Partial<StructuredResume> = {}): StructuredResume => ({ summary: "", skills: ["a", "b"], experience: [], education: [], languages: [], projects: [], ...over });

  it("reviewCounts / foundSentence", () => {
    const c = reviewCounts(s({ experience: [{} as never, {} as never, {} as never], education: [{} as never], projects: [{} as never] }));
    expect(c).toEqual({ roles: 3, schools: 1, skills: 2, projects: 1 });
    expect(foundSentence(c)).toBe("3 roles, 1 school, 2 skills, 1 project");
    expect(foundSentence({ roles: 0, schools: 0, skills: 0, projects: 0 })).toBe("0 roles, 0 schools, 0 skills");
  });

  it("removedLine is only there when something was removed", () => {
    expect(removedLine(0)).toBeNull();
    expect(removedLine(1)).toBe("We removed 1 sensitive value — we never collect those.");
    expect(removedLine(3)).toBe("We removed 3 sensitive values — we never collect those.");
  });
});

describe("keepMaskOf", () => {
  const structured = { summary: "x", skills: ["a"], experience: [{}, {}, {}], education: [{}, {}], languages: [], projects: [{}] } as unknown as StructuredResume;

  it("is undefined when nothing was unticked", () => {
    expect(keepMaskOf(structured, NOTHING_UNTICKED)).toBeUndefined();
  });

  it("lists the indexes that stay, per list that lost something", () => {
    const m = keepMaskOf(structured, { ...NOTHING_UNTICKED, experience: new Set([1]), education: new Set([0, 1]), skills: true, summary: true });
    expect(m).toEqual({ experience: [0, 2], education: [], skills: false, summary: false });
  });
});

describe("itemOfPath", () => {
  it("maps an API path to the review row", () => {
    expect(itemOfPath("structured.experience[2].bullets[0]")).toEqual({ list: "experience", index: 2 });
    expect(itemOfPath("structured.education[0]")).toEqual({ list: "education", index: 0 });
    expect(itemOfPath("structured.projects[11].name")).toEqual({ list: "projects", index: 11 });
    expect(itemOfPath("structured.skills")).toBeNull();
    expect(itemOfPath("bio.email")).toBeNull();
  });
});

describe("default name per source", () => {
  const ctx = { profileHeadline: "Backend Engineer", fileName: "Ada Lovelace CV.final.pdf", copyFrom: "Backend v3" };
  it("profile -> headline or 'My resume'", () => {
    expect(defaultName("profile", ctx)).toBe("Backend Engineer");
    expect(defaultName("profile", { ...ctx, profileHeadline: "  " })).toBe("My resume");
    expect(defaultName("profile", { ...ctx, profileHeadline: null })).toBe("My resume");
  });
  it("upload -> the file name without its extension", () => {
    expect(defaultName("upload", ctx)).toBe("Ada Lovelace CV.final");
    expect(defaultName("upload", { ...ctx, fileName: null })).toBe("My resume");
    expect(stripExtension("C:\\docs\\cv.pdf")).toBe("cv");
    expect(stripExtension(".hidden")).toBe(".hidden");
  });
  it("copy -> '<name> (copy)'; scratch -> 'My resume'", () => {
    expect(defaultName("copy", ctx)).toBe("Backend v3 (copy)");
    expect(defaultName("scratch", ctx)).toBe("My resume");
  });
});

describe("buildPayload", () => {
  const structured = { summary: "", skills: [], experience: [{}, {}], education: [], languages: [], projects: [] } as unknown as StructuredResume;

  it("sends only what was filled in", () => {
    expect(buildPayload({ source: "profile", name: " My CV ", target: "  " })).toEqual({ source: { kind: "profile" }, label: "My CV" });
    expect(buildPayload({ source: "scratch", name: "", target: "Dev", templateId: "modern" })).toEqual({ source: { kind: "scratch" }, target: "Dev", templateId: "modern" });
    expect(buildPayload({ source: "copy", name: "X (copy)", target: "", copyFromId: 9 })).toEqual({ source: { kind: "copy", fromResumeId: 9 }, label: "X (copy)" });
  });

  it("carries the upload with its KeepMask", () => {
    const u = { structured, bio: { firstName: "Ada" }, fileName: "cv.pdf", unticked: { ...NOTHING_UNTICKED, experience: new Set([0]) } };
    expect(buildPayload({ source: "upload", name: "cv", target: "", upload: u })).toEqual({
      source: { kind: "upload", structured, bio: { firstName: "Ada" }, fileName: "cv.pdf", keep: { experience: [1] } },
      label: "cv",
    });
  });
});

describe("capNotice", () => {
  it("is null while there is room", () => {
    expect(capNotice({ count: 2, max: 3 }, "FREE")).toBeNull();
  });
  it("Free sees Pro; paid plans are told to archive one", () => {
    expect(capNotice({ count: 3, max: 3 }, "FREE")).toEqual({ plan: "FREE", limit: 3, message: "You've reached 3 resumes — See Pro for more." });
    expect(capNotice({ count: 25, max: 25 }, "PRO")?.message).toContain("archive one to make room");
    expect(capNotice({ count: 50, max: 50 }, "AUTOPILOT")?.plan).toBe("AUTOPILOT");
  });
});
