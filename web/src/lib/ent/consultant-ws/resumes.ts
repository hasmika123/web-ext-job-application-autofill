/**
 * The Consultant workspace "My Resumes" client logic (design/enterprise-consultant/resumes.webp): the wire types of
 * `GET /api/orgs/{orgId}/me-workspace/resumes`, a tolerant parser, the pure helpers the page uses (sorting, labels, the printable
 * text/HTML built from the structured fields) and the BFF calls. Nothing here touches React.
 *
 * Rules the page keeps:
 *   - every figure comes from the API; there is no fallback number in this file;
 *   - there is no stored resume file: Download and Print are generated here from the structured fields (headline, summary,
 *     skills, experience) returned by the preview endpoint.
 */
import type { Fetched } from "@/components/ent/consultant-ws/parts";
import type { Tone } from "./home";

export interface ResumeTile {
  value: number;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  sparkline: number[];
}

export type Visibility = "INTERNAL" | "PUBLIC" | "PRIVATE";

export interface ResumeRow {
  id: number;
  title: string;
  targetRole: string | null;
  primary: boolean;
  updatedAt: string | null;
  visibility: Visibility;
  versionNo: number;
  approvalStatus: string;
}

export interface Check {
  key: string;
  label: string;
  done: boolean;
}

export interface Improvement {
  key: string;
  title: string;
  hint: string;
  action: "set-primary" | "link";
  href: string | null;
  resumeId: number | null;
}

export type ActivityKind = "VIEWED" | "DOWNLOADED" | "SHARED" | "UPDATED";

export interface ActivityRow {
  kind: ActivityKind;
  resumeId: number;
  resumeTitle: string;
  versionNo: number;
  at: string;
}

export interface ResumesView {
  orgId: number;
  generatedAt: string;
  me: { consultantId: number; name: string };
  tiles: { totalResumes: ResumeTile; primary: { value: number; title: string | null }; totalViews: ResumeTile; totalDownloads: ResumeTile; timesShared: ResumeTile };
  resumes: ResumeRow[];
  resumeStrength: { percent: number; hasResume: boolean; checks: Check[] };
  improvements: Improvement[];
  recentActivity: ActivityRow[];
}

export interface PreviewExperience {
  title: string | null;
  employer: string | null;
  startYear: number | null;
  endYear: number | null;
}

export interface ResumePreview {
  id: number;
  title: string;
  targetRole: string | null;
  versionNo: number;
  visibility: Visibility;
  updatedAt: string | null;
  name: string;
  email: string | null;
  jobTitle: string | null;
  headline: string | null;
  summary: string | null;
  skills: string[];
  experience: PreviewExperience[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const VISIBILITIES: readonly string[] = ["INTERNAL", "PUBLIC", "PRIVATE"];
const KINDS: readonly string[] = ["VIEWED", "DOWNLOADED", "SHARED", "UPDATED"];

function tileOf(v: unknown): ResumeTile {
  const d = isObj(v) ? v : {};
  return {
    value: num(d.value),
    previous: numOrNull(d.previous),
    delta: numOrNull(d.delta),
    deltaPct: numOrNull(d.deltaPct),
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
  };
}

function rowsOf<T>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] {
  return arr(v)
    .map((o) => (isObj(o) ? f(o) : null))
    .filter((x): x is T => x !== null);
}

export function parseResumeRow(o: unknown): ResumeRow | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.title !== "string" || typeof o.visibility !== "string" || !VISIBILITIES.includes(o.visibility)) return null;
  return {
    id: o.id,
    title: o.title,
    targetRole: strOrNull(o.targetRole),
    primary: o.primary === true,
    updatedAt: strOrNull(o.updatedAt),
    visibility: o.visibility as Visibility,
    versionNo: num(o.versionNo, 1),
    approvalStatus: typeof o.approvalStatus === "string" ? o.approvalStatus : "APPROVED",
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseResumes(body: unknown): ResumesView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.me) || !isObj(body.tiles)) return null;
  const t = body.tiles;
  const strength = isObj(body.resumeStrength) ? body.resumeStrength : {};
  const primary = isObj(t.primary) ? t.primary : {};
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    me: { consultantId: num(body.me.consultantId), name: typeof body.me.name === "string" ? body.me.name : "" },
    tiles: { totalResumes: tileOf(t.totalResumes), primary: { value: num(primary.value), title: strOrNull(primary.title) }, totalViews: tileOf(t.totalViews), totalDownloads: tileOf(t.totalDownloads), timesShared: tileOf(t.timesShared) },
    resumes: arr(body.resumes).map(parseResumeRow).filter((r): r is ResumeRow => r !== null),
    resumeStrength: {
      percent: Math.max(0, Math.min(100, num(strength.percent))),
      hasResume: strength.hasResume === true,
      checks: rowsOf(strength.checks, (o) => (typeof o.key === "string" && typeof o.label === "string" ? { key: o.key, label: o.label, done: o.done === true } : null)),
    },
    improvements: rowsOf(body.improvements, (o) =>
      typeof o.key === "string" && typeof o.title === "string" && (o.action === "set-primary" || o.action === "link")
        ? { key: o.key, title: o.title, hint: typeof o.hint === "string" ? o.hint : "", action: o.action, href: strOrNull(o.href), resumeId: numOrNull(o.resumeId) }
        : null,
    ),
    recentActivity: rowsOf(body.recentActivity, (o) =>
      typeof o.kind === "string" && KINDS.includes(o.kind) && typeof o.at === "string" && typeof o.resumeTitle === "string"
        ? { kind: o.kind as ActivityKind, resumeId: num(o.resumeId), resumeTitle: o.resumeTitle, versionNo: num(o.versionNo, 1), at: o.at }
        : null,
    ),
  };
}

export function parsePreview(body: unknown): ResumePreview | null {
  if (!isObj(body) || typeof body.id !== "number" || typeof body.title !== "string" || typeof body.name !== "string") return null;
  return {
    id: body.id,
    title: body.title,
    targetRole: strOrNull(body.targetRole),
    versionNo: num(body.versionNo, 1),
    visibility: (VISIBILITIES.includes(String(body.visibility)) ? body.visibility : "INTERNAL") as Visibility,
    updatedAt: strOrNull(body.updatedAt),
    name: body.name,
    email: strOrNull(body.email),
    jobTitle: strOrNull(body.jobTitle),
    headline: strOrNull(body.headline),
    summary: strOrNull(body.summary),
    skills: arr(body.skills).filter((s): s is string => typeof s === "string" && s !== ""),
    experience: rowsOf(body.experience, (o) => ({ title: strOrNull(o.title), employer: strOrNull(o.employer), startYear: numOrNull(o.startYear), endYear: numOrNull(o.endYear) })),
  };
}

/* ── labels, sorting, formatting ─────────────────────────────────────────────────── */

/** INTERNAL is shown as "Team" (visible inside the organization). */
export const VISIBILITY_LABELS: Record<Visibility, { label: string; tone: Tone }> = {
  PUBLIC: { label: "Public", tone: "green" },
  PRIVATE: { label: "Private", tone: "amber" },
  INTERNAL: { label: "Team", tone: "blue" },
};

export const SORT_OPTIONS = [
  { value: "updated", label: "Last Updated" },
  { value: "title", label: "Title (A-Z)" },
  { value: "version", label: "Version (highest first)" },
  { value: "visibility", label: "Visibility" },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

/** A sorted copy; the primary resume is not pinned, the caller's chosen order is the order. */
export function sortResumes(rows: ResumeRow[], by: SortKey): ResumeRow[] {
  const copy = [...rows];
  const byTitle = (a: ResumeRow, b: ResumeRow) => a.title.localeCompare(b.title, "en", { sensitivity: "base" });
  const time = (r: ResumeRow) => (r.updatedAt ? Date.parse(r.updatedAt) || 0 : 0);
  switch (by) {
    case "title":
      return copy.sort(byTitle);
    case "version":
      return copy.sort((a, b) => b.versionNo - a.versionNo || byTitle(a, b));
    case "visibility":
      return copy.sort((a, b) => VISIBILITY_LABELS[a.visibility].label.localeCompare(VISIBILITY_LABELS[b.visibility].label) || byTitle(a, b));
    default:
      return copy.sort((a, b) => time(b) - time(a) || byTitle(a, b));
  }
}

/** "+33%" / "-10%" / "0%" from the API's percentage, or "+1" from an absolute change; null (draw nothing) when there is nothing to compare. */
export function changeText(tile: ResumeTile, mode: "pct" | "abs"): { dir: "up" | "down" | "flat"; text: string } | null {
  if (mode === "abs") {
    if (tile.delta === null) return null;
    return { dir: tile.delta > 0 ? "up" : tile.delta < 0 ? "down" : "flat", text: tile.delta > 0 ? `+${tile.delta}` : String(tile.delta) };
  }
  const p = tile.deltaPct;
  if (p === null || !Number.isFinite(p)) return null;
  const abs = Math.abs(p);
  const body = `${abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10}%`;
  return p === 0 ? { dir: "flat", text: "0%" } : { dir: p > 0 ? "up" : "down", text: `${p > 0 ? "+" : "-"}${body}` };
}

export const ACTIVITY_LABELS: Record<ActivityKind, string> = { VIEWED: "Resume viewed", DOWNLOADED: "Resume downloaded", SHARED: "Resume shared", UPDATED: "Resume updated" };

/** "Oct 14, 2024" and "10:24 AM" in the viewer's zone. */
export function dateOf(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}
export function timeOf(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}

export const verdictOf = (pct: number): string => (pct >= 75 ? "Your resume is looking good!" : pct >= 50 ? "Your resume is getting there." : "Your resume needs attention.");

/* ── printable output (no stored file: built from the structured fields) ──────────── */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const span = (e: PreviewExperience): string => {
  if (e.startYear === null && e.endYear === null) return "";
  return `${e.startYear ?? ""} - ${e.endYear ?? "Present"}`;
};

/** A plain-text resume (the download and the "share" clipboard text). */
export function resumeText(p: ResumePreview): string {
  const lines: string[] = [p.name];
  const sub = [p.headline ?? p.jobTitle, p.email].filter(Boolean).join(" | ");
  if (sub) lines.push(sub);
  if (p.summary) lines.push("", "SUMMARY", p.summary);
  if (p.skills.length) lines.push("", "SKILLS", p.skills.join(", "));
  if (p.experience.length) {
    lines.push("", "EXPERIENCE");
    for (const e of p.experience) lines.push(`${[e.title, e.employer].filter(Boolean).join(", ")}${span(e) ? ` (${span(e)})` : ""}`);
  }
  return lines.join("\n") + "\n";
}

/** A standalone printable HTML page. All values are escaped; no script, no remote resource. */
export function resumeHtml(p: ResumePreview): string {
  const e = escapeHtml;
  const sub = [p.headline ?? p.jobTitle, p.email].filter(Boolean).map((x) => e(x as string)).join(" &middot; ");
  const exp = p.experience
    .map((x) => `<li><strong>${e(x.title ?? "")}</strong>${x.employer ? `, ${e(x.employer)}` : ""}${span(x) ? ` <span class="m">${e(span(x))}</span>` : ""}</li>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(p.title)}</title><style>
body{font:14px/1.5 Georgia,serif;color:CanvasText;max-width:720px;margin:32px auto;padding:0 24px}
h1{font-size:26px;margin:0}h2{font-size:12px;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid silver;padding-bottom:4px;margin:22px 0 8px}
.m{color:GrayText}ul{padding-left:18px;margin:0}li{margin:4px 0}p{margin:0}
</style></head><body><h1>${e(p.name)}</h1>${sub ? `<p class="m">${sub}</p>` : ""}${p.summary ? `<h2>Summary</h2><p>${e(p.summary)}</p>` : ""}${p.skills.length ? `<h2>Skills</h2><p>${p.skills.map(e).join(" &middot; ")}</p>` : ""}${exp ? `<h2>Experience</h2><ul>${exp}</ul>` : ""}</body></html>`;
}

export const fileNameOf = (title: string, ext: string): string => `${title.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "resume"}.${ext}`;

/* ── the BFF calls (the browser talks to Next, Next to the API) ──────────────────── */

export type ResumesFetch = Fetched<ResumesView>;

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/resumes`;

export async function fetchResumes(orgId: number | string, signal?: AbortSignal): Promise<ResumesFetch> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseResumes(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export async function fetchPreview(orgId: number | string, resumeId: number): Promise<{ kind: "OK"; preview: ResumePreview } | { kind: "FAILED" | "DENIED" }> {
  try {
    const res = await fetch(`${base(orgId)}/${resumeId}/preview`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const preview = parsePreview(await res.json().catch(() => null));
    return preview ? { kind: "OK", preview } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type WriteResult<T = null> = { ok: true; data: T } | { ok: false; message: string };

async function write<T>(url: string, method: "POST" | "PATCH", body: unknown, read: (j: unknown) => T | null): Promise<WriteResult<T>> {
  try {
    const res = await fetch(url, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const msg = isObj(json) && typeof json.error === "string" ? json.error : res.status === 404 ? "That resume is no longer available." : "That didn't work. Nothing has changed.";
      return { ok: false, message: msg };
    }
    const data = read(json);
    return data === null && res.status !== 204 ? { ok: false, message: "That didn't work. Nothing has changed." } : { ok: true, data: data as T };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Nothing has changed." };
  }
}

const rowOnly = (j: unknown) => parseResumeRow(j);
export const setPrimary = (orgId: number | string, id: number) => write(`${base(orgId)}/${id}/primary`, "POST", undefined, rowOnly);
export const patchResume = (orgId: number | string, id: number, body: { name?: string; visibility?: Visibility }) => write(`${base(orgId)}/${id}`, "PATCH", body, rowOnly);
export const duplicateResume = (orgId: number | string, id: number) => write(`${base(orgId)}/${id}/duplicate`, "POST", undefined, rowOnly);
export const recordActivity = (orgId: number | string, id: number, kind: "VIEWED" | "DOWNLOADED" | "SHARED") => write<null>(`${base(orgId)}/${id}/activity`, "POST", { kind }, () => null);
