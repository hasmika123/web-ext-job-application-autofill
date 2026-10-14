/**
 * The Consultant workspace Settings page's client logic (design/enterprise-consultant/settings.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/settings` (+ its two writes), a tolerant parser and the pure helpers the page uses. Nothing here
 * touches React and there is no fallback number. No password, token, key or phone number exists anywhere in this contract: password,
 * two-factor and sign-in alerts live on the Kiwiply account, and connected tools are not available yet.
 */
import type { Tone } from "./home";

export type Visibility = "ORG_ONLY" | "APPROVED_EMPLOYERS" | "PRIVATE";
export type Theme = "LIGHT" | "DARK" | "SYSTEM";
export type PrivacyLevel = "PERSONAL" | "SHARED" | "PRIVATE";
export type ActivityKind = "PRIVACY" | "APPEARANCE" | "PROFILE" | "AVAILABILITY";

export const VISIBILITIES: readonly Visibility[] = ["ORG_ONLY", "APPROVED_EMPLOYERS", "PRIVATE"];
export const THEMES: readonly Theme[] = ["LIGHT", "DARK", "SYSTEM"];
export const LEVELS: readonly PrivacyLevel[] = ["PERSONAL", "SHARED", "PRIVATE"];
export const ACTIVITY_KINDS: readonly ActivityKind[] = ["PRIVACY", "APPEARANCE", "PROFILE", "AVAILABILITY"];

/** Where the account's own sign-in settings live (the Kiwiply account page). */
export const ACCOUNT_SETTINGS_PATH = "/settings";

export interface Settings {
  profileVisibility: Visibility;
  shareProfileWithEmployers: boolean;
  showContactInformation: boolean;
  allowAnalytics: boolean;
  theme: Theme;
  language: string;
  timezone: string;
  isDefault: boolean;
}

export interface Tool {
  key: string;
  name: string;
  state: string;
}

export interface ActivityRow {
  kind: ActivityKind;
  label: string;
  detail: string | null;
  at: string;
}

export interface SettingsView {
  orgId: number;
  generatedAt: string;
  name: string;
  orgName: string;
  account: { name: string; email: string | null; location: string | null };
  tiles: {
    profileStatus: { percent: number; complete: boolean };
    privacy: { level: PrivacyLevel; orgName: string };
    connectedTools: { connected: number; total: number };
  };
  career: {
    employmentTypes: string[];
    workMode: string | null;
    targetRoles: string[];
    locations: string[];
    rateMinMinor: number | null;
    rateMaxMinor: number | null;
    availabilityStatus: string | null;
  };
  settings: Settings;
  tools: Tool[];
  documents: { resumes: number };
  activity: ActivityRow[];
  languages: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x !== "");
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => list.find((x) => x === v) ?? null;

export function parseActivity(o: unknown): ActivityRow | null {
  if (!isObj(o) || typeof o.label !== "string" || typeof o.at !== "string") return null;
  return { kind: oneOf(ACTIVITY_KINDS, o.kind) ?? "PROFILE", label: o.label, detail: strOrNull(o.detail), at: o.at };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseSettings(body: unknown): SettingsView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.settings) || !isObj(body.tiles) || !isObj(body.account)) return null;
  const s = body.settings;
  const t = body.tiles;
  const ps = isObj(t.profileStatus) ? t.profileStatus : {};
  const pv = isObj(t.privacy) ? t.privacy : {};
  const ct = isObj(t.connectedTools) ? t.connectedTools : {};
  const a = body.account;
  const c = isObj(body.careerPreferences) ? body.careerPreferences : {};
  const d = isObj(body.documents) ? body.documents : {};
  const orgName = str(body.orgName, "your organization");
  return {
    orgId: body.orgId,
    generatedAt: str(body.generatedAt),
    name: str(body.name),
    orgName,
    account: { name: str(a.name), email: strOrNull(a.email), location: strOrNull(a.location) },
    tiles: {
      profileStatus: { percent: Math.max(0, Math.min(100, num(ps.percent))), complete: ps.complete === true },
      privacy: { level: oneOf(LEVELS, pv.level) ?? "PERSONAL", orgName: str(pv.orgName, orgName) },
      connectedTools: { connected: num(ct.connected), total: num(ct.total) },
    },
    career: {
      employmentTypes: strings(c.employmentTypes),
      workMode: strOrNull(c.workMode),
      targetRoles: strings(c.targetRoles),
      locations: strings(c.locations),
      rateMinMinor: numOrNull(c.rateMinMinor),
      rateMaxMinor: numOrNull(c.rateMaxMinor),
      availabilityStatus: strOrNull(c.availabilityStatus),
    },
    settings: {
      profileVisibility: oneOf(VISIBILITIES, s.profileVisibility) ?? "ORG_ONLY",
      shareProfileWithEmployers: s.shareProfileWithEmployers === true,
      showContactInformation: s.showContactInformation === true,
      allowAnalytics: s.allowAnalytics === true,
      theme: oneOf(THEMES, s.theme) ?? "SYSTEM",
      language: str(s.language, "en-US"),
      timezone: str(s.timezone, "UTC"),
      isDefault: s.isDefault === true,
    },
    tools: arr(body.tools)
      .filter(isObj)
      .map((x) => ({ key: str(x.key), name: str(x.name), state: str(x.state, "NOT_AVAILABLE") }))
      .filter((x) => x.key !== "" && x.name !== ""),
    documents: { resumes: Math.max(0, num(d.resumes)) },
    activity: arr(body.activity)
      .map(parseActivity)
      .filter((x): x is ActivityRow => x !== null),
    languages: strings(body.languages),
  };
}

/* ── wording ──────────────────────────────────────────────────────────────────────────── */

export const VISIBILITY_LABEL: Record<Visibility, (org: string) => { title: string; hint: string }> = {
  ORG_ONLY: (org) => ({ title: `Visible to ${org} only`, hint: `Your profile is visible to ${org} team members.` }),
  APPROVED_EMPLOYERS: (org) => ({ title: `Visible to ${org} and approved employers`, hint: `Your profile is visible to ${org} team members and employers your marketer has approved.` }),
  PRIVATE: () => ({ title: "Private", hint: "Your profile is hidden from everyone but you and the people who prepare your applications." }),
};

export const THEME_LABEL: Record<Theme, string> = { LIGHT: "Light", DARK: "Dark", SYSTEM: "System default" };

export const LANGUAGE_LABEL: Record<string, string> = { "en-US": "English (US)", "en-GB": "English (UK)", "es-ES": "Spanish (Spain)", "fr-FR": "French (France)", "de-DE": "German (Germany)" };

/** A small, common set; any other zone the API stored is added to the list so the select always shows the saved value. */
export const COMMON_TIMEZONES: readonly string[] = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function timezoneOptions(current: string): string[] {
  return COMMON_TIMEZONES.includes(current) ? [...COMMON_TIMEZONES] : [current, ...COMMON_TIMEZONES];
}

export const timezoneLabel = (zone: string): string => zone.replace(/_/g, " ");

export function privacyTile(t: SettingsView["tiles"]["privacy"]): { value: string; sub: string } {
  if (t.level === "PRIVATE") return { value: "Private", sub: "Only you and your preparers" };
  if (t.level === "SHARED") return { value: "Shared", sub: "Shared with approved employers" };
  return { value: "Personal", sub: `Visible to ${t.orgName} only` };
}

export function profileTile(t: SettingsView["tiles"]["profileStatus"]): { value: string; sub: string } {
  return t.complete ? { value: "Complete", sub: "100% profile completed" } : { value: `${t.percent}%`, sub: "profile completed" };
}

export const toolsTile = (t: SettingsView["tiles"]["connectedTools"]): string => `of ${t.total} available tools`;

const EMPLOYMENT: Record<string, string> = { CONTRACT: "Contract", CONTRACT_TO_HIRE: "Contract-to-Hire", FULL_TIME: "Full-time", PART_TIME: "Part-time" };
const AVAILABILITY: Record<string, string> = { AVAILABLE: "Available now", ON_PROJECT: "On a project", NOTICE: "On notice", UNAVAILABLE: "Not available" };

export const employmentText = (types: string[]): string => types.map((t) => EMPLOYMENT[t] ?? t).join(", ");
export const availabilityText = (s: string | null): string | null => (s ? (AVAILABILITY[s] ?? s) : null);
export const listText = (items: string[]): string | null => (items.length ? items.join(", ") : null);

const money = (minor: number): string => `$${Math.round(minor / 100)}`;
export function rateText(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${money(min)} - ${money(max)}`;
  return money((min ?? max) as number);
}

export function activityTone(kind: ActivityKind): Tone {
  return kind === "PRIVACY" ? "violet" : kind === "APPEARANCE" ? "blue" : kind === "AVAILABILITY" ? "amber" : "green";
}

/** "2 hours ago" style, in plain words; older than a week falls back to the date. */
export function whenText(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.floor((nowMs - t) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

export type WriteResult = { kind: "OK"; view: SettingsView } | { kind: "DENIED" } | { kind: "INVALID"; message: string } | { kind: "FAILED" };

export interface PrivacyPatch {
  profileVisibility?: Visibility;
  shareProfileWithEmployers?: boolean;
  showContactInformation?: boolean;
  allowAnalytics?: boolean;
}

export interface AppearancePatch {
  theme?: Theme;
  language?: string;
  timezone?: string;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/settings`;

export async function fetchSettings(orgId: number | string, signal?: AbortSignal): Promise<Fetched<SettingsView>> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseSettings(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

async function put(orgId: number | string, tail: string, body: unknown): Promise<WriteResult> {
  try {
    const res = await fetch(`${base(orgId)}${tail}`, { method: "PUT", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 422 || res.status === 400) {
      const o = isObj(json) ? json : {};
      return { kind: "INVALID", message: typeof o.error === "string" ? o.error : "That value was not accepted." };
    }
    if (!res.ok) return { kind: "FAILED" };
    const view = parseSettings(json);
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export const savePrivacy = (orgId: number | string, patch: PrivacyPatch) => put(orgId, "/privacy", patch);
export const saveAppearance = (orgId: number | string, patch: AppearancePatch) => put(orgId, "/appearance", patch);

/** What a patch would look like to undo it: the same keys with the current values. */
export function inversePrivacy(s: Settings, patch: PrivacyPatch): PrivacyPatch {
  const out: PrivacyPatch = {};
  if (patch.profileVisibility !== undefined) out.profileVisibility = s.profileVisibility;
  if (patch.shareProfileWithEmployers !== undefined) out.shareProfileWithEmployers = s.shareProfileWithEmployers;
  if (patch.showContactInformation !== undefined) out.showContactInformation = s.showContactInformation;
  if (patch.allowAnalytics !== undefined) out.allowAnalytics = s.allowAnalytics;
  return out;
}

export function applyPrivacy(s: Settings, patch: PrivacyPatch): Settings {
  return { ...s, ...patch, isDefault: false };
}

export function inverseAppearance(s: Settings, patch: AppearancePatch): AppearancePatch {
  const out: AppearancePatch = {};
  if (patch.theme !== undefined) out.theme = s.theme;
  if (patch.language !== undefined) out.language = s.language;
  if (patch.timezone !== undefined) out.timezone = s.timezone;
  return out;
}

/** The privacy level the API derives from the stored settings (kept in step here so the tile follows an optimistic change). */
export function levelOf(s: Pick<Settings, "profileVisibility" | "shareProfileWithEmployers">): PrivacyLevel {
  if (s.profileVisibility === "PRIVATE") return "PRIVATE";
  return s.profileVisibility === "APPROVED_EMPLOYERS" || s.shareProfileWithEmployers ? "SHARED" : "PERSONAL";
}
