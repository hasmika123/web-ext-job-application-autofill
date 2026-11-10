/**
 * Enterprise demo only (docs/enterprise-v2/demo/DEMO-PLAN.md section 16): the marketer tailors a consultant's resume for one job, assigns the job, and the
 * consultant's Prepare attaches that resume. The tailoring itself is PRESET (tailor-preset.json): one job, one consultant, fixed changes and scores. The
 * assignment, the tailored resume (a real resume with a PDF, made by web/scripts/demo-setup.mjs) and the extension attaching it are real.
 *
 * The UI shows only when the demo is on (GET /api/demo) AND the job matches the preset, so no real organization ever sees it.
 */
import preset from "./tailor-preset.json";

export interface TailorChange {
  id: string;
  section: string;
  points: number;
  before: string;
  after: string;
  why: string;
}

export interface TailorAddition {
  id: string;
  skill: string;
  points: number;
  note: string;
  default: boolean;
}

export interface TailorKeyword {
  term: string;
  before: boolean;
  /** The change / addition ids that cover this keyword once accepted. */
  by?: string[];
}

export interface TailorPreset {
  id: string;
  job: { title: string; company: string; location: string; jobUrl: string; externalJobId: string; skills: string[]; keyInfo: string };
  consultant: { name: string; login: string; marketer: string };
  resume: { fromLabelPrefix: string; label: string; title: string; fileName: string };
  scoreBefore: number;
  keywords: TailorKeyword[];
  changes: TailorChange[];
  additions: TailorAddition[];
}

export const TAILOR_PRESET = preset as unknown as TailorPreset;

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The preset for this job (title + company), or null. */
export function tailorPresetFor(title: string | null | undefined, company: string | null | undefined): TailorPreset | null {
  const p = TAILOR_PRESET;
  return norm(title) === norm(p.job.title) && norm(company) === norm(p.job.company) ? p : null;
}

/** The ids accepted by default: every change, and the additions the consultant confirmed. */
export function defaultAccepted(p: TailorPreset): Set<string> {
  return new Set([...p.changes.map((c) => c.id), ...p.additions.filter((a) => a.default).map((a) => a.id)]);
}

/** The match score once the accepted changes are in (capped at 100). */
export function scoreAfter(p: TailorPreset, accepted: ReadonlySet<string>): number {
  const gain = [...p.changes, ...p.additions].reduce((n, c) => n + (accepted.has(c.id) ? c.points : 0), 0);
  return Math.min(100, p.scoreBefore + gain);
}

/** Is this keyword covered with these changes accepted? */
export function keywordCovered(k: TailorKeyword, accepted: ReadonlySet<string>): boolean {
  return k.before || (k.by ?? []).some((id) => accepted.has(id));
}

/** The final state the tailored PDF was built with (every change + the default additions): what the consultant's side shows. */
export const PRESET_FINAL_SCORE = scoreAfter(TAILOR_PRESET, defaultAccepted(TAILOR_PRESET));

/** Is the demo on? (the public GET /api/demo). Cached for the page's life; false on any failure. */
let demoOn: Promise<boolean> | null = null;
export function demoEnabled(): Promise<boolean> {
  if (!demoOn) {
    demoOn = fetch("/api/demo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { enabled?: unknown } | null) => j?.enabled === true)
      .catch(() => false);
  }
  return demoOn;
}

/** The consultant's tailored resume (their own resume list, by the preset's label), through the demo BFF route. */
export interface TailoredResume {
  id: number;
  label: string;
  archived: boolean;
}

export async function fetchTailoredResume(): Promise<TailoredResume | null> {
  try {
    const r = await fetch("/api/demo/tailored-resume", { cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { resume?: TailoredResume | null } | null;
    return j?.resume ?? null;
  } catch {
    return null;
  }
}

/** The consultant approves the tailored resume (their Prepare click): it joins their resume list. Returns the resume, or null. */
export async function approveTailoredResume(): Promise<TailoredResume | null> {
  try {
    const r = await fetch("/api/demo/tailored-resume", { method: "POST", cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { resume?: TailoredResume | null } | null;
    return j?.resume ?? null;
  } catch {
    return null;
  }
}
