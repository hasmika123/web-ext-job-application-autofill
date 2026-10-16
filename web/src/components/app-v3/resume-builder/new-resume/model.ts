/**
 * The pure parts of the "New resume" start chooser (Resume Builder R2.6, DESIGN 10.14, DECISIONS #29):
 * the four sources, the profile summary a card shows, the review counts of an uploaded file, the default
 * name per source, the `KeepMask` the user's unticking becomes, the payload for `POST /api/resumes/built`
 * and the cap notice. No React, no network.
 */
import type { ParsedBio, StructuredResume } from "@kiwiply/ui";
import type { Completeness, ProfileItem } from "@/lib/profile-items";
import type { BuiltSource, CreateBuiltBody, KeepMask } from "@/lib/resume-doc";

/** The four cards, in the order DESIGN 10.14 lists them. */
export const SOURCES = ["profile", "upload", "copy", "scratch"] as const;
export type SourceId = (typeof SOURCES)[number];

export const DEFAULT_NAME = "My resume";

/** What the "Use my profile" card says about the user's saved profile. */
export interface ProfileSummary {
  /** Live (not hidden) profile items. 0 = the empty-profile state. */
  itemCount: number;
  roles: number;
  schools: number;
  skills: number;
  /** Profile strength, 0-100, or null when the API did not answer. */
  score: number | null;
  /** The profile's headline (the default name of a resume made from it), or null. */
  headline: string | null;
}

export const EMPTY_PROFILE: ProfileSummary = { itemCount: 0, roles: 0, schools: 0, skills: 0, score: null, headline: null };

/** Counts for the profile card from the item rows and the completeness meter; pure. */
export function summarizeProfile(items: readonly ProfileItem[], completeness: Completeness | null, headline?: string | null): ProfileSummary {
  const live = items.filter((i) => !i.hidden);
  let skills = 0;
  for (const i of live) {
    if (i.section !== "SKILL") continue;
    const list = (i.data as { skills?: unknown }).skills;
    skills += Array.isArray(list) ? list.length : 0;
  }
  const h = typeof headline === "string" && headline.trim() ? headline.trim() : null;
  return {
    itemCount: live.length,
    roles: live.filter((i) => i.section === "EXPERIENCE").length,
    schools: live.filter((i) => i.section === "EDUCATION").length,
    skills,
    score: completeness ? Math.round(completeness.score) : null,
    headline: h,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Your saved profile: 3 roles · 2 schools · 14 skills · 78% complete"; empty -> "Your profile is empty". `subject` ("Casey's") speaks about someone else's profile (a marketer acting for a consultant). */
export function profileDescription(p: ProfileSummary, subject?: string | null): string {
  const whose = subject ? subject : "Your";
  if (p.itemCount === 0) return `${whose} profile is empty`;
  const parts = [plural(p.roles, "role"), plural(p.schools, "school"), plural(p.skills, "skill")];
  if (p.score !== null) parts.push(`${p.score}% complete`);
  return `${whose} saved profile: ${parts.join(" · ")}`;
}

/** A resume the Copy card can start from. */
export interface ResumeChoice {
  id: number;
  name: string;
  /** `RECORD`: a resume of the organization directory with no Resume Builder document (its `id` is the NEGATED directory id; see {@link directoryIdOf}). */
  kind: "BUILT" | "UPLOADED" | "RECORD";
  updatedAt: string | null;
  score: number | null;
  /** The template it uses, so step 2 can name it ("Template: Modern") for a copy. */
  templateId: string | null;
}

/** "Start from one of your 4 resumes". */
export const copyDescription = (n: number, subject?: string | null): string =>
  n === 0 ? (subject ? `${subject} has no resume to copy yet` : "You don't have a resume to copy yet") : `Start from one of ${subject ?? "your"} ${n} ${n === 1 ? "resume" : "resumes"}`;

/** What the review card says about an uploaded file ("We found 3 roles, 2 schools, 14 skills"). */
export interface ReviewCounts {
  roles: number;
  schools: number;
  skills: number;
  projects: number;
}

export function reviewCounts(s: StructuredResume): ReviewCounts {
  return { roles: s.experience?.length ?? 0, schools: s.education?.length ?? 0, skills: s.skills?.length ?? 0, projects: s.projects?.length ?? 0 };
}

export function foundSentence(c: ReviewCounts): string {
  const parts = [plural(c.roles, "role"), plural(c.schools, "school"), plural(c.skills, "skill")];
  if (c.projects > 0) parts.push(plural(c.projects, "project"));
  return parts.join(", ");
}

/** "We removed 2 sensitive values — we never collect those." (null when none). */
export function removedLine(n: number): string | null {
  if (n <= 0) return null;
  return `We removed ${plural(n, "sensitive value")} — we never collect those.`;
}

/** What the user unticked in the review (everything is ticked at first). */
export interface Unticked {
  experience: ReadonlySet<number>;
  education: ReadonlySet<number>;
  projects: ReadonlySet<number>;
  skills: boolean;
  summary: boolean;
}

export const NOTHING_UNTICKED: Unticked = { experience: new Set(), education: new Set(), projects: new Set(), skills: false, summary: false };

const keptIndexes = (total: number, unticked: ReadonlySet<number>): number[] => Array.from({ length: total }, (_, i) => i).filter((i) => !unticked.has(i));

/** The `KeepMask` for the API; a list is only sent when something in it was unticked (absent = keep all). */
export function keepMaskOf(s: StructuredResume, u: Unticked): KeepMask | undefined {
  const keep: KeepMask = {};
  if (u.experience.size > 0) keep.experience = keptIndexes(s.experience?.length ?? 0, u.experience);
  if (u.education.size > 0) keep.education = keptIndexes(s.education?.length ?? 0, u.education);
  if (u.projects.size > 0) keep.projects = keptIndexes(s.projects?.length ?? 0, u.projects);
  if (u.skills) keep.skills = false;
  if (u.summary) keep.summary = false;
  return Object.keys(keep).length > 0 ? keep : undefined;
}

/** `structured.experience[2].bullets[0]` -> the review row to mark; null for a path that is not one of the lists. */
export function itemOfPath(path: string): { list: "experience" | "education" | "projects"; index: number } | null {
  const m = /^structured\.(experience|education|projects)\[(\d+)\]/.exec(path);
  return m ? { list: m[1] as "experience" | "education" | "projects", index: Number(m[2]) } : null;
}

/** The file's name without its extension: "Ada Lovelace CV.pdf" -> "Ada Lovelace CV". */
export function stripExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  const name = (dot > 0 ? base.slice(0, dot) : base).trim();
  return name;
}

export interface NameContext {
  profileHeadline: string | null;
  fileName: string | null;
  copyFrom: string | null;
}

/** The default name per source (DESIGN 10.14 step 2): profile -> headline or "My resume"; upload -> the file name; copy -> "<name> (copy)"; scratch -> "My resume". */
export function defaultName(source: SourceId, ctx: NameContext): string {
  switch (source) {
    case "profile":
      return ctx.profileHeadline?.trim() || DEFAULT_NAME;
    case "upload":
      return (ctx.fileName && stripExtension(ctx.fileName)) || DEFAULT_NAME;
    case "copy":
      return ctx.copyFrom?.trim() ? `${ctx.copyFrom.trim()} (copy)` : DEFAULT_NAME;
    case "scratch":
      return DEFAULT_NAME;
  }
}

export interface PayloadInput {
  source: SourceId;
  name: string;
  target: string;
  templateId?: string | null;
  upload?: { structured: StructuredResume; bio: ParsedBio; fileName: string; unticked: Unticked } | null;
  copyFromId?: number | null;
}

/** A negative choice id stands for an organization directory record with no builder document: `-id` is the directory row. Null for a builder resume. */
export const directoryIdOf = (choiceId: number): number | null => (choiceId < 0 ? -choiceId : null);

/** The body of `POST /api/resumes/built` for the chosen source. */
export function buildPayload(i: PayloadInput): CreateBuiltBody {
  let source: BuiltSource;
  switch (i.source) {
    case "profile":
      source = { kind: "profile" };
      break;
    case "scratch":
      source = { kind: "scratch" };
      break;
    case "copy": {
      const from = i.copyFromId ?? 0;
      const directory = directoryIdOf(from);
      source = directory !== null ? { kind: "directory", orgResumeId: directory } : { kind: "copy", fromResumeId: from };
      break;
    }
    case "upload": {
      const u = i.upload;
      source = u
        ? { kind: "upload", structured: u.structured, bio: u.bio, fileName: u.fileName, keep: keepMaskOf(u.structured, u.unticked) }
        : { kind: "scratch" };
      break;
    }
  }
  const body: CreateBuiltBody = { source };
  const label = i.name.trim();
  if (label) body.label = label;
  const target = i.target.trim();
  if (target) body.target = target;
  if (i.templateId) body.templateId = i.templateId;
  return body;
}

/** Why "New resume" must not open the chooser: the plan's cap, with the copy the upload screen uses (DESIGN 10.14). */
export interface CapNotice {
  message: string;
  /** `ORGANIZATION`: inside an organization workspace the license decides (nothing to upgrade to). */
  plan: "FREE" | "PRO" | "AUTOPILOT" | "ORGANIZATION";
  /** The cap as the server reported it, when it did. */
  limit?: number;
}

export function capNotice(resumes: { count: number; max: number }, plan: "FREE" | "PRO" | "AUTOPILOT" | "ORGANIZATION"): CapNotice | null {
  if (resumes.count < resumes.max) return null;
  return {
    plan,
    limit: resumes.max,
    message:
      plan === "ORGANIZATION"
        ? `Your organization's license keeps up to ${resumes.max} resumes for you. Ask your organization admin if you need more room.`
        : plan === "FREE"
          ? `You've reached ${resumes.max} resumes — See Pro for more.`
          : "You've reached your resume limit — archive one to make room.",
  };
}
