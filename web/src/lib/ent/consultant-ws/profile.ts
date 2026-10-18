/**
 * My Career Profile's client logic (design/enterprise-consultant/profile.webp): the wire types of
 * `GET /api/orgs/{orgId}/me-workspace/profile`, a tolerant parser, the pure helpers the cards use, and the write calls (each answers
 * with the fresh view). Nothing here touches React.
 *
 * Rules the page keeps:
 *   - every figure and list comes from the API's answer; there is no fallback value in this file;
 *   - no sensitive PII: work authorization is a status CHOICE (never a document or visa number); no photo and no date of birth are
 *     stored, the photo spot is an initials circle.
 */

export type AvailabilityStatus = "AVAILABLE" | "ON_PROJECT" | "NOTICE" | "UNAVAILABLE";
export type EmploymentType = "CONTRACT" | "CONTRACT_TO_HIRE" | "FULL_TIME" | "PART_TIME";
export type WorkAuthorization = "AUTHORIZED_NO_SPONSORSHIP" | "AUTHORIZED_NEEDS_SPONSORSHIP" | "NOT_AUTHORIZED";

export interface Missing {
  key: string;
  label: string;
  section: string;
}
export interface SkillItem {
  id: number;
  skill: string;
  primary: boolean;
}
export interface CertificationItem {
  id: number;
  name: string;
  issuer: string | null;
  issuedOn: string | null;
}
export interface ExperienceItem {
  id: number;
  title: string;
  employer: string | null;
  startYear: number | null;
  endYear: number | null;
}
export interface PrefItem {
  id: number;
  value: string;
}

export interface ProfileView {
  orgId: number;
  me: { consultantId: number; name: string; jobTitle: string | null; yearsExperience: number | null; location: string | null; workMode: string | null; phone: string | null; timeZone: string | null; preferredContact: string | null };
  availability: { status: AvailabilityStatus; since: string | null; availableFrom: string | null };
  strength: { percent: number; missing: Missing[] };
  summary: { text: string | null; source: "RESUME" | "PROFILE" | "NONE"; hasResume: boolean };
  skills: SkillItem[];
  certifications: CertificationItem[];
  experience: { resumeName: string | null; items: ExperienceItem[] };
  preferences: { roles: PrefItem[]; locations: PrefItem[]; employmentTypes: EmploymentType[] };
  workAuthorization: WorkAuthorization | null;
  careerGoals: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = ["AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE"];
export const EMPLOYMENT_TYPES: readonly EmploymentType[] = ["CONTRACT", "CONTRACT_TO_HIRE", "FULL_TIME", "PART_TIME"];
export const WORK_AUTHORIZATIONS: readonly WorkAuthorization[] = ["AUTHORIZED_NO_SPONSORSHIP", "AUTHORIZED_NEEDS_SPONSORSHIP", "NOT_AUTHORIZED"];

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseProfile(body: unknown): ProfileView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.me)) return null;
  const rows = <T,>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] =>
    arr(v)
      .map((o) => (isObj(o) ? f(o) : null))
      .filter((x): x is T => x !== null);
  const av = isObj(body.availability) ? body.availability : {};
  const st = isObj(body.strength) ? body.strength : {};
  const sm = isObj(body.summary) ? body.summary : {};
  const ex = isObj(body.experience) ? body.experience : {};
  const pf = isObj(body.preferences) ? body.preferences : {};
  const pref = (v: unknown) => rows(v, (o) => (typeof o.id === "number" && typeof o.value === "string" ? { id: o.id, value: o.value } : null));
  const status = AVAILABILITY_STATUSES.find((s) => s === av.status) ?? "AVAILABLE";
  return {
    orgId: body.orgId,
    me: {
      consultantId: num(body.me.consultantId),
      name: typeof body.me.name === "string" ? body.me.name : "",
      jobTitle: strOrNull(body.me.jobTitle),
      yearsExperience: numOrNull(body.me.yearsExperience),
      location: strOrNull(body.me.location),
      workMode: strOrNull(body.me.workMode),
      phone: strOrNull(body.me.phone),
      timeZone: strOrNull(body.me.timeZone),
      preferredContact: strOrNull(body.me.preferredContact),
    },
    availability: { status, since: strOrNull(av.since), availableFrom: strOrNull(av.availableFrom) },
    strength: {
      percent: Math.max(0, Math.min(100, Math.round(num(st.percent)))),
      missing: rows(st.missing, (o) => (typeof o.key === "string" && typeof o.label === "string" ? { key: o.key, label: o.label, section: typeof o.section === "string" ? o.section : o.key } : null)),
    },
    summary: {
      text: strOrNull(sm.text),
      source: sm.source === "RESUME" || sm.source === "PROFILE" ? sm.source : "NONE",
      hasResume: sm.hasResume === true,
    },
    skills: rows(body.skills, (o) => (typeof o.id === "number" && typeof o.skill === "string" ? { id: o.id, skill: o.skill, primary: o.primary === true } : null)),
    certifications: rows(body.certifications, (o) =>
      typeof o.id === "number" && typeof o.name === "string" ? { id: o.id, name: o.name, issuer: strOrNull(o.issuer), issuedOn: strOrNull(o.issuedOn) } : null,
    ),
    experience: {
      resumeName: strOrNull(ex.resumeName),
      items: rows(ex.items, (o) =>
        typeof o.id === "number" && typeof o.title === "string" ? { id: o.id, title: o.title, employer: strOrNull(o.employer), startYear: numOrNull(o.startYear), endYear: numOrNull(o.endYear) } : null,
      ),
    },
    preferences: {
      roles: pref(pf.roles),
      locations: pref(pf.locations),
      employmentTypes: arr(pf.employmentTypes).filter((t): t is EmploymentType => EMPLOYMENT_TYPES.includes(t as EmploymentType)),
    },
    workAuthorization: WORK_AUTHORIZATIONS.find((w) => w === body.workAuthorization) ?? null,
    careerGoals: strOrNull(body.careerGoals),
  };
}

/* ── labels and pure helpers ─────────────────────────────────────────────────────── */

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, { label: string; detail: string; tone: "green" | "amber" | "blue" | "slate" }> = {
  AVAILABLE: { label: "Available", detail: "Open to new opportunities immediately", tone: "green" },
  NOTICE: { label: "On notice", detail: "Open to new opportunities after your notice period", tone: "amber" },
  ON_PROJECT: { label: "On a project", detail: "Currently on a project", tone: "blue" },
  UNAVAILABLE: { label: "Not available", detail: "Not taking new opportunities right now", tone: "slate" },
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  CONTRACT: "Contract",
  CONTRACT_TO_HIRE: "Contract to Hire",
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
};

export const WORK_AUTH_LABELS: Record<WorkAuthorization, { label: string; note: string }> = {
  AUTHORIZED_NO_SPONSORSHIP: { label: "Authorized to work in the United States", note: "No sponsorship required" },
  AUTHORIZED_NEEDS_SPONSORSHIP: { label: "Authorized to work in the United States", note: "Sponsorship needed in the future" },
  NOT_AUTHORIZED: { label: "Not currently authorized to work in the United States", note: "Sponsorship required" },
};

/** "8+ years" / "1 year" / null (draw nothing) when the profile has no figure. */
export function yearsText(years: number | null): string | null {
  if (years === null || years < 0) return null;
  if (years === 1) return "1 year";
  return years >= 8 ? `${years}+ years` : `${years} years`;
}

/** The ring's verdict line. */
export function strengthVerdict(percent: number): string {
  if (percent >= 75) return "Your profile is looking good!";
  if (percent >= 50) return "Your profile is getting there.";
  return "Your profile needs attention.";
}

/** "Mar 2023" from a date (UTC, so the month never moves with the viewer's zone). */
export function monthYear(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "2021 – Present", "2018 – 2020", "2019" or "" from the resume row's years. */
export function yearsRange(start: number | null, end: number | null): string {
  if (start === null && end === null) return "";
  if (start === null) return String(end);
  if (end === null) return `${start} – Present`;
  return start === end ? String(start) : `${start} – ${end}`;
}

/** Two letters for the photo placeholder (we store no photos). */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}

/** Same rule the API enforces, so the form refuses early: trimmed, not empty, within the limit, no angle brackets. */
export function checkText(value: string, max: number, required = true): string | null {
  const t = value.trim();
  if (!t) return required ? "Enter a value." : null;
  if (t.length > max) return `Use at most ${max} characters.`;
  if (/[<>]/.test(t)) return "Angle brackets are not allowed.";
  return null;
}

/** "2023-03" valid month (not in the future), or null when fine. */
export function checkMonth(value: string, now = new Date()): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return "Pick a month.";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 1970) return "Pick a valid month.";
  if (y > now.getUTCFullYear() || (y === now.getUTCFullYear() && mo > now.getUTCMonth() + 1)) return "Pick a month that has passed.";
  return null;
}

/* ── the BFF calls (the browser talks to Next, Next to the API) ───────────────────── */

export type ProfileResult = { kind: "OK"; view: ProfileView } | { kind: "DENIED" } | { kind: "INVALID"; message: string; sensitive: boolean } | { kind: "FAILED" };

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/profile`;

async function call(orgId: number | string, tail: string, method: "GET" | "PUT" | "POST" | "DELETE", body?: unknown, signal?: AbortSignal): Promise<ProfileResult> {
  try {
    const res = await fetch(`${base(orgId)}${tail}`, {
      method,
      headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 422 || res.status === 400) {
      const o = isObj(json) ? json : {};
      return { kind: "INVALID", message: typeof o.error === "string" ? o.error : "That value was not accepted.", sensitive: o.code === "SENSITIVE_CONTENT" };
    }
    if (!res.ok) return { kind: "FAILED" };
    const view = parseProfile(json);
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export const fetchProfile = (orgId: number | string, signal?: AbortSignal) => call(orgId, "", "GET", undefined, signal);
export const saveAvailability = (orgId: number | string, status: AvailabilityStatus) => call(orgId, "/availability", "PUT", { status });
export const saveSummary = (orgId: number | string, text: string) => call(orgId, "/summary", "PUT", { text });
export const saveCareerGoals = (orgId: number | string, text: string) => call(orgId, "/career-goals", "PUT", { text });
export const saveContact = (orgId: number | string, body: { phone: string; timeZone: string; preferredContact: string }) => call(orgId, "/contact", "PUT", body);
export const saveWorkAuthorization = (orgId: number | string, value: WorkAuthorization | null) => call(orgId, "/work-authorization", "PUT", { value });
export const saveEmploymentTypes = (orgId: number | string, values: EmploymentType[]) => call(orgId, "/employment-types", "PUT", { values });
export const addSkill = (orgId: number | string, skill: string) => call(orgId, "/skills", "POST", { skill });
export const removeSkill = (orgId: number | string, id: number) => call(orgId, `/skills/${id}`, "DELETE");
export const addCertification = (orgId: number | string, name: string, issuer: string, issuedOn: string) => call(orgId, "/certifications", "POST", { name, issuer, issuedOn });
export const removeCertification = (orgId: number | string, id: number) => call(orgId, `/certifications/${id}`, "DELETE");
export const addPref = (orgId: number | string, kind: "ROLE" | "LOCATION", value: string) => call(orgId, "/prefs", "POST", { kind, value });
export const removePref = (orgId: number | string, id: number) => call(orgId, `/prefs/${id}`, "DELETE");
