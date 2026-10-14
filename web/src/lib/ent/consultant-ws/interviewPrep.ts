/**
 * The Consultant workspace Interview Prep page's client logic (design/enterprise-consultant/interview-prep.webp): wire types of
 * `GET /api/orgs/{orgId}/me-workspace/interview-prep` (+ `/sessions/{id}` and the two write calls), tolerant parsers and the pure helpers
 * the page uses (labels, tones, tile text, dates, the self-score average, the optimistic checklist). Nothing here touches React and there
 * is no fallback number: every figure is the API's answer. There is no AI scoring: a session is questions the consultant scores themselves.
 */
import type { Tone } from "./home";

export type PrepKind = "TECHNICAL" | "BEHAVIORAL" | "COMPANY" | "QUESTION_BANK";
const KINDS: readonly string[] = ["TECHNICAL", "BEHAVIORAL", "COMPANY", "QUESTION_BANK"];

export interface PrepTile {
  /** null = nothing to show yet (no sessions to average); never a made-up 0. */
  value: number | null;
  previous: number | null;
  delta: number | null;
  unit: "COUNT" | "POINTS";
  sparkline: number[];
}

export interface PrepQuestion {
  id: string;
  text: string;
}

export interface PrepModule {
  key: string;
  title: string;
  description: string;
  kind: PrepKind;
  action: "PRACTICE" | "RESEARCH";
  chips: string[];
  chipsFromProfile: boolean;
  questions: PrepQuestion[];
}

export interface CheckItem {
  key: string;
  label: string;
  checked: boolean;
  checkedAt: string | null;
}

export interface NextInterview {
  interviewId: number;
  scheduledAt: string;
  role: string | null;
  company: string | null;
  round: string | null;
}

export interface SessionRow {
  id: number;
  title: string;
  kind: PrepKind;
  score: number;
  durationMinutes: number;
  occurredAt: string;
  hasNotes: boolean;
  answerCount: number;
}

export interface AnswerRow {
  position: number;
  question: string;
  score: number;
}

export interface SessionDetail {
  session: SessionRow;
  notes: string | null;
  answers: AnswerRow[];
}

export interface PrepView {
  orgId: number;
  generatedAt: string;
  name: string;
  tiles: { upcoming: PrepTile; score: PrepTile; sets: PrepTile; weak: PrepTile };
  modules: PrepModule[];
  history: SessionRow[];
  checklist: CheckItem[];
  next: NextInterview | null;
  weakKinds: PrepKind[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rows = <T,>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] =>
  arr(v)
    .map((o) => (isObj(o) ? f(o) : null))
    .filter((x): x is T => x !== null);
const isKind = (v: unknown): v is PrepKind => typeof v === "string" && KINDS.includes(v);
const pct = (n: number) => Math.max(0, Math.min(100, n));

function tileOf(v: unknown): PrepTile {
  const d = isObj(v) ? v : {};
  return {
    value: numOrNull(d.value),
    previous: numOrNull(d.previous),
    delta: numOrNull(d.delta),
    unit: d.unit === "POINTS" ? "POINTS" : "COUNT",
    sparkline: arr(d.sparkline).filter((n): n is number => typeof n === "number" && Number.isFinite(n)),
  };
}

export function parseSessionRow(o: unknown): SessionRow | null {
  if (!isObj(o) || typeof o.id !== "number" || typeof o.title !== "string" || !isKind(o.kind)) return null;
  return {
    id: o.id,
    title: o.title,
    kind: o.kind,
    score: pct(num(o.score)),
    durationMinutes: Math.max(0, num(o.durationMinutes)),
    occurredAt: typeof o.occurredAt === "string" ? o.occurredAt : "",
    hasNotes: o.hasNotes === true,
    answerCount: Math.max(0, num(o.answerCount)),
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parsePrep(body: unknown): PrepView | null {
  if (!isObj(body) || typeof body.orgId !== "number" || !isObj(body.tiles)) return null;
  const t = body.tiles;
  const next = isObj(body.next) && typeof body.next.interviewId === "number" ? body.next : null;
  return {
    orgId: body.orgId,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    name: typeof body.name === "string" ? body.name : "",
    tiles: { upcoming: tileOf(t.upcoming), score: tileOf(t.score), sets: tileOf(t.sets), weak: tileOf(t.weak) },
    modules: rows(body.modules, (o) =>
      typeof o.key === "string" && typeof o.title === "string" && isKind(o.kind)
        ? {
            key: o.key,
            title: o.title,
            description: typeof o.description === "string" ? o.description : "",
            kind: o.kind,
            action: o.action === "RESEARCH" ? "RESEARCH" : "PRACTICE",
            chips: arr(o.chips).filter((c): c is string => typeof c === "string"),
            chipsFromProfile: o.chipsFromProfile === true,
            questions: rows(o.questions, (q) => (typeof q.id === "string" && typeof q.text === "string" ? { id: q.id, text: q.text } : null)),
          }
        : null,
    ),
    history: arr(body.history)
      .map(parseSessionRow)
      .filter((s): s is SessionRow => s !== null),
    checklist: rows(body.checklist, (o) => (typeof o.key === "string" && typeof o.label === "string" ? { key: o.key, label: o.label, checked: o.checked === true, checkedAt: strOrNull(o.checkedAt) } : null)),
    next: next
      ? { interviewId: next.interviewId as number, scheduledAt: typeof next.scheduledAt === "string" ? next.scheduledAt : "", role: strOrNull(next.role), company: strOrNull(next.company), round: strOrNull(next.round) }
      : null,
    weakKinds: arr(body.weakKinds).filter(isKind),
  };
}

export function parseSessionDetail(body: unknown): SessionDetail | null {
  if (!isObj(body)) return null;
  const session = parseSessionRow(body.session);
  if (!session) return null;
  return {
    session,
    notes: strOrNull(body.notes),
    answers: rows(body.answers, (o) => (typeof o.question === "string" ? { position: num(o.position), question: o.question, score: pct(num(o.score)) } : null)),
  };
}

/* ── labels and tones ─────────────────────────────────────────────────────────────────── */

export const KIND_LABEL: Record<PrepKind, string> = { TECHNICAL: "Technical", BEHAVIORAL: "Behavioral", COMPANY: "Company", QUESTION_BANK: "Question Bank" };
export const KIND_TONE: Record<PrepKind, Tone> = { TECHNICAL: "violet", BEHAVIORAL: "green", COMPANY: "amber", QUESTION_BANK: "blue" };

/** The module a "Practice again" action opens for a history type; Company has nothing to practise (it links to research). */
export const KIND_MODULE: Record<PrepKind, string> = { TECHNICAL: "technical", BEHAVIORAL: "behavioral", COMPANY: "company", QUESTION_BANK: "question-bank" };

export const WEAK_BELOW = 75;

/** Ring / bar colour for a score: green 80+, amber 75-79, coral below the weak line. */
export const scoreTone = (score: number): "green" | "amber" | "coral" => (score >= 80 ? "green" : score >= WEAK_BELOW ? "amber" : "coral");

/** The change under a tile from the API's own delta ("+12 pts", "-2", "0"); null (draw nothing) when there is none. */
export function tileDelta(t: PrepTile): { dir: "up" | "down" | "flat"; text: string } | null {
  if (t.delta === null) return null;
  const suffix = t.unit === "POINTS" ? " pts" : "";
  if (t.delta === 0) return { dir: "flat", text: `0${suffix}` };
  return { dir: t.delta > 0 ? "up" : "down", text: `${t.delta > 0 ? "+" : "-"}${Math.abs(t.delta)}${suffix}` };
}

/** For Weak Areas fewer is better, so an increase reads as bad. */
export const deltaIsGood = (dir: "up" | "down" | "flat", lowerIsBetter: boolean): boolean | null => (dir === "flat" ? null : lowerIsBetter ? dir === "down" : dir === "up");

export const durationText = (minutes: number): string => (minutes === 1 ? "1 min" : `${minutes} mins`);

const parse = (iso: string): Date | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Oct 14, 2024" and "11:32 AM" in the viewer's zone; empty strings for a bad date. */
export function sessionWhen(iso: string): { date: string; time: string } {
  const d = parse(iso);
  if (!d) return { date: "", time: "" };
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

/** "Tue, Oct 15 at 10:00 AM" for the next-interview line. */
export function nextWhen(iso: string): string {
  const d = parse(iso);
  if (!d) return "";
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** "Senior Java Developer at Acme", "Senior Java Developer", "Acme" or "" from the next interview. */
export function nextLabel(n: NextInterview | null): string {
  if (!n) return "";
  if (n.role && n.company) return `${n.role} at ${n.company}`;
  return n.role ?? n.company ?? "";
}

/* ── the practice sheet ───────────────────────────────────────────────────────────────── */

export const MAX_NOTES = 1000;
export const MAX_MINUTES = 600;

/** The average of the scored questions as the page previews it (the API computes the stored score the same way); null when none. */
export function averageScore(scores: Record<string, number | undefined>): number | null {
  const vals = Object.values(scores).filter((v): v is number => typeof v === "number");
  return vals.length === 0 ? null : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Whole minutes from opening the sheet to saving, at least 1 and at most the API's limit. */
export function elapsedMinutes(startedMs: number, nowMs: number): number {
  const mins = Math.ceil(Math.max(0, nowMs - startedMs) / 60_000);
  return Math.max(1, Math.min(MAX_MINUTES, mins));
}

/** Why the sheet cannot be saved yet, or null when it can. */
export function sheetProblem(scores: Record<string, number | undefined>, notes: string): string | null {
  if (averageScore(scores) === null) return "Score at least one question before saving.";
  if (notes.length > MAX_NOTES) return `Notes can be up to ${MAX_NOTES} characters.`;
  return null;
}

/* ── the checklist ────────────────────────────────────────────────────────────────────── */

/** A new list with one item ticked or unticked (optimistic update and its undo). */
export const withChecked = (list: CheckItem[], key: string, checked: boolean): CheckItem[] => list.map((c) => (c.key === key ? { ...c, checked, checkedAt: checked ? (c.checkedAt ?? new Date().toISOString()) : null } : c));

export const checklistProgress = (list: CheckItem[]): { done: number; total: number } => ({ done: list.filter((c) => c.checked).length, total: list.length });

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/interview-prep`;

async function read<T>(url: string, parser: (b: unknown) => T | null, signal?: AbortSignal): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parser(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export const fetchPrep = (orgId: number | string, signal?: AbortSignal) => read(base(orgId), parsePrep, signal);
export const fetchSession = (orgId: number | string, id: number, signal?: AbortSignal) => read(`${base(orgId)}/sessions/${id}`, parseSessionDetail, signal);

export interface WriteResult<T = undefined> {
  ok: boolean;
  /** The API's own message for a refusal (for example the sensitive-data one), when it sent one. */
  message?: string;
  value?: T;
}

async function write<T>(url: string, method: "POST" | "PUT", body: unknown, parser?: (b: unknown) => T | null): Promise<WriteResult<T>> {
  try {
    const res = await fetch(url, { method, headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    if (res.ok) {
      if (!parser) return { ok: true };
      const value = parser(await res.json().catch(() => null));
      return value ? { ok: true, value } : { ok: false, message: "The answer was not what we expected." };
    }
    const j = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown; message?: unknown } | null;
    const m = j && typeof j.error === "string" ? j.error : j && typeof j.detail === "string" ? j.detail : j && typeof j.message === "string" ? j.message : undefined;
    return { ok: false, message: m };
  } catch {
    return { ok: false };
  }
}

export interface SessionInput {
  moduleKey: string;
  durationMinutes: number;
  notes: string;
  answers: { questionId: string; score: number }[];
}

export const saveSession = (orgId: number | string, input: SessionInput) =>
  write(`${base(orgId)}/sessions`, "POST", { moduleKey: input.moduleKey, durationMinutes: input.durationMinutes, ...(input.notes.trim() ? { notes: input.notes.trim() } : {}), answers: input.answers }, parseSessionDetail);

export const setChecked = (orgId: number | string, key: string, checked: boolean) => write(`${base(orgId)}/checklist/${encodeURIComponent(key)}`, "PUT", { checked });
