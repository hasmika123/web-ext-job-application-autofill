/**
 * The words and small rules of the resume header bar (DESIGN 10.16), kept apart from the markup so they are
 * unit-testable: the visibility label that derives People > Organization > Private, the recruiter-sharing label, a
 * link's expiry sentence, the version rows' "by" text, and who "you" is.
 */
import type { ResumeActor, ResumeMeta, ResumeRole, ResumeVersion } from "@/lib/resume-meta";

export const UNTITLED = "Untitled resume";

/** "Master Resume" / "Tailored Resume": the type pill. */
export const typeLabel = (role: ResumeRole): string => (role === "TAILORED" ? "Tailored Resume" : "Master Resume");

/** The short type label of the phone chip row ("Master ▾"). */
export const typeShortLabel = (role: ResumeRole): string => (role === "TAILORED" ? "Tailored" : "Master");

/** Visibility's label: `Specific people (n)` when someone has a grant, else `My organization` when shared with it, else `Private`. */
export function visibilityLabel(v: ResumeMeta["visibility"]): string {
  if (v.people > 0) return `Specific people (${v.people})`;
  if (v.mode === "ORG") return "My organization";
  return "Private";
}

/** What the row-2 chip says about recruiter links. */
export const recruiterLabel = (on: boolean, short = false): string => `${short ? "Recruiters" : "Shared with Recruiters"}: ${on ? "On" : "Off"}`;

/** The Version chip: "Version 3", or "No versions yet" before the first. */
export const versionChipLabel = (current: number, short = false): string => (current <= 0 ? (short ? "No versions" : "No versions yet") : short ? `v${current}` : `Version ${current}`);

// config-literal-ok: milliseconds in a day, a unit conversion
const MS_PER_DAY = 86_400_000;

/** "Expires in 23 days", "Expires today", "Expired" or "Never expires" for a link grant. */
export function expiryText(expiresAt: string | null | undefined, expired: boolean, nowMs: number): string {
  if (expired) return "Expired";
  if (!expiresAt) return "Never expires";
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return "Never expires";
  const days = Math.ceil((t - nowMs) / MS_PER_DAY);
  if (days <= 0) return "Expires today";
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

/** "12 views" / "1 view" / "No views yet". */
export const viewsText = (n: number): string => (n <= 0 ? "No views yet" : `${n} ${n === 1 ? "view" : "views"}`);

/**
 * The login that counts as "you" when the header is open. The editor is owner-only, and a resume the owner made has
 * `createdBy` = the owner; for one made by someone else (a marketer) the owner's login is not on the object, so nothing
 * is called "you" and the names are shown as they are.
 */
export function ownerLoginOf(meta: ResumeMeta | null): string | null {
  if (!meta || meta.source.madeBy) return null;
  return meta.createdBy?.login ?? null;
}

/** "you" for the owner's own writes, else the person's name. */
export function actorText(actor: ResumeActor | null | undefined, ownerLogin: string | null): string {
  if (!actor) return "you";
  return ownerLogin !== null && actor.login === ownerLogin ? "you" : actor.label;
}

/** `title` of the Last modified chip: the absolute time and who. */
export function modifiedTitle(meta: ResumeMeta, absolute: string, ownerLogin: string | null): string {
  const by = actorText(meta.updatedBy, ownerLogin);
  return absolute ? `${absolute} by ${by}` : `by ${by}`;
}

/** The kind chip of a version row: only the ones the user made on purpose get a word. */
export function versionKindChip(v: Pick<ResumeVersion, "kind">): string | null {
  return v.kind === "named" ? "named" : v.kind === "checkpoint" ? "saved" : null;
}

/* ── Resume settings (R3.12, DESIGN 10.12) ───────────────────────────────────────────── */

/** The org sees this resume: paired at FULL scope and the per-resume switch is on. */
export const orgSeesResume = (v: ResumeMeta["visibility"], shareWithOrg: boolean): boolean => v.orgPaired !== null && v.orgScope === "FULL" && shareWithOrg;

/**
 * The first line of the Visibility card: "Private — only you", or the parts that are shared joined with " · ":
 * "Shared with 2 people · 1 link · your marketer Rahul".
 */
export function visibilitySummary(meta: Pick<ResumeMeta, "visibility" | "recruiterSharing" | "shareWithOrg">): string {
  const parts: string[] = [];
  const people = meta.visibility.people;
  if (people > 0) parts.push(`${people} ${people === 1 ? "person" : "people"}`);
  const links = meta.recruiterSharing.links;
  if (links > 0) parts.push(`${links} ${links === 1 ? "link" : "links"}`);
  if (orgSeesResume(meta.visibility, meta.shareWithOrg)) parts.push(`your marketer ${meta.visibility.orgPaired}`);
  return parts.length === 0 ? "Private — only you" : `Shared with ${parts.join(" · ")}`;
}

/** The My organization row's sentence: what the member lets the organization see, and that resumes are (not) part of it. */
export function orgScopeCopy(scope: string, pairedWith: string | null): string {
  if (scope === "FULL") return `You share Full details with your organization${pairedWith ? ` — ${pairedWith} is your marketer` : ""}.`;
  if (scope === "SUMMARY") return "You share Summary with your organization — resumes are not visible.";
  return "You don't share anything with your organization — resumes are not visible.";
}

/** The About card's source line: "Built · Modern", "Uploaded", "Tailored from <base> for <role> @ <company>", "Made by your marketer Rahul". */
export function sourceLine(meta: Pick<ResumeMeta, "kind" | "source">, templateName: string | null): string {
  const s = meta.source;
  if (s.madeBy) return `Made by your marketer ${s.madeBy}`;
  if (meta.kind === "UPLOADED") return "Uploaded";
  if (s.tailoredFrom) {
    const job = s.tailoredFrom.job ? ` for ${s.tailoredFrom.job.title} @ ${s.tailoredFrom.job.company}` : "";
    return `Tailored from ${s.tailoredFrom.label}${job}`;
  }
  return templateName ? `Built · ${templateName}` : "Built";
}

/** One view row's second line: what the viewer did. */
export const viewWhat = (what: string): string => (what === "PDF" ? "Downloaded the PDF" : "Opened the page");
