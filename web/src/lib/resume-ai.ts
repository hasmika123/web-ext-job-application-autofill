/**
 * Client-side fetchers and copy for the Resume Builder's AI (R4.2, DESIGN 9.5 / 13): "Rewrite with AI" asks for a
 * checked proposal, the person accepts change by change, and Apply names refs and an alternative index - never text.
 * Spring owns every rule (plan gate, consent, cache, caps, truth checks); this file types the answers, turns the
 * refusals into outcomes the UI can branch on, and holds the sentences the UI shows for them. Every call returns a
 * tagged result and never throws.
 */
import type { ResumeDocDTO } from "./resume-doc";
import { parseEtag } from "./resume-doc";

/** The rewrite modes (DESIGN 13.2); `stronger` is the default. */
export type RewriteMode = "stronger" | "shorter" | "formal" | "plain" | "grammar";

export const REWRITE_MODES: ReadonlyArray<{ value: RewriteMode; label: string; hint: string }> = [
  { value: "stronger", label: "Stronger", hint: "Lead with a strong verb and the result" },
  { value: "shorter", label: "Shorter", hint: "Same facts in fewer words" },
  { value: "formal", label: "More formal", hint: "A more professional tone" },
  { value: "plain", label: "Plain language", hint: "Simple words, short sentences" },
  { value: "grammar", label: "Fix grammar", hint: "Spelling, grammar and consistency only" },
];

export const DEFAULT_REWRITE_MODE: RewriteMode = "stronger";

export const modeLabel = (mode: string | null | undefined): string => REWRITE_MODES.find((m) => m.value === mode)?.label ?? "Stronger";

/** The literal the model leaves where it needs a real figure from the person (DESIGN 13.1). */
export const PLACEHOLDER = "[add a number]";

export const hasPlaceholder = (text: string): boolean => text.toLowerCase().includes(PLACEHOLDER);

/** One proposed change to one line. `after` is the first alternative; `alternatives` holds all of them when there are several. */
export interface AiChange {
  ref: string;
  section: string;
  before: string;
  after: string;
  alternatives?: string[];
  reason?: string;
  sources?: string[];
  /** The line has inline formatting that applying the change resets. */
  formatted?: boolean;
}

export interface AiProposal {
  id: number;
  task: string;
  mode?: string | null;
  /** The resume changed since this was made: it can no longer be applied. */
  stale: boolean;
  createdAt?: string;
  changes: AiChange[];
  suggestions?: string[];
  model?: string | null;
  aiCallId?: number | null;
}

/** The meter: `used` out of `limit` (percent of the period budget for the paid plans), or the day's count when `cap` is "daily". */
export interface AiUsageView {
  used: number;
  limit: number;
  resetsAt?: string | null;
  economy?: boolean;
}

export type ProposalStatus = "ok" | "cached" | "disabled" | "consentRequired" | "quotaExceeded" | "nothingToChange" | "error";

export interface ProposalResult {
  status: ProposalStatus;
  proposal?: AiProposal;
  usage?: AiUsageView;
  /** "daily" when the daily call cap (not the period budget) ran out. */
  cap?: string;
  dropped?: number;
}

/** The text a change would write for the chosen alternative (index 0 = `after`). */
export function chosenText(change: AiChange, index = 0): string {
  const alts = change.alternatives && change.alternatives.length > 0 ? change.alternatives : [change.after];
  return alts[Math.min(Math.max(index, 0), alts.length - 1)] ?? change.after;
}

/** What a request for a proposal came to. 402 is `locked` (Free); the refusals that are statuses come inside `result`. */
export type AiOutcome =
  | { kind: "result"; result: ProposalResult }
  | { kind: "locked" }
  | { kind: "error"; status: number; message: string; retry: boolean };

/** What applying a proposal came to; `stale` and `closed` mean "ask again", the others name the fix. */
export type ApplyOutcome =
  | { kind: "ok"; dto: ResumeDocDTO }
  | { kind: "stale" }
  | { kind: "closed" }
  | { kind: "placeholder" }
  | { kind: "keepEmpty" }
  | { kind: "locked" }
  | { kind: "error"; status: number; message: string };

interface Problem {
  code?: string;
  message?: string;
  detail?: string;
  error?: string;
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const NETWORK = "Couldn't reach Kiwiply. Check your connection and try again.";

/** `POST /api/resumes/:id/ai/rewrite {refs, mode, consent}`. The click on a mode is the consent (DECISIONS: the disclosure is next to it). */
export async function requestRewrite(resumeId: number, refs: readonly string[], mode: RewriteMode, signal?: AbortSignal): Promise<AiOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/resumes/${resumeId}/ai/rewrite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refs, mode, consent: true }),
      signal,
    });
  } catch {
    return { kind: "error", status: 0, message: NETWORK, retry: true };
  }
  if (res.ok) {
    const result = await readJson<ProposalResult>(res);
    return result && typeof result.status === "string" ? { kind: "result", result } : { kind: "error", status: res.status, message: "Kiwiply AI's answer was incomplete. Try again.", retry: true };
  }
  if (res.status === 402) return { kind: "locked" };
  const p = (await readJson<Problem>(res)) ?? {};
  if (res.status === 401) return { kind: "error", status: 401, message: "Your session expired. Sign in again.", retry: false };
  if (res.status === 429) return { kind: "error", status: 429, message: "Too many AI requests in a row. Wait a moment and try again.", retry: true };
  if (res.status === 404) return { kind: "error", status: 404, message: "That resume is no longer there.", retry: false };
  if (res.status === 400) return { kind: "error", status: 400, message: p.message && p.message !== "error.resumeDoc" ? p.message : "Those lines can't be rewritten.", retry: false };
  return { kind: "error", status: res.status, message: p.error ?? "Couldn't reach Kiwiply AI right now. Try again.", retry: true };
}

/** `POST /api/ai/proposals/:pid/apply {keep, alternatives}`: the updated document and its new version (the ETag). */
export async function applyProposal(proposalId: number, keep: readonly string[], alternatives: Readonly<Record<string, number>>): Promise<ApplyOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/proposals/${proposalId}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keep, alternatives }),
    });
  } catch {
    return { kind: "error", status: 0, message: NETWORK };
  }
  if (res.ok) {
    const dto = await readJson<ResumeDocDTO>(res);
    if (!dto) return { kind: "error", status: res.status, message: "The server's answer was incomplete." };
    return { kind: "ok", dto: { ...dto, docVersion: parseEtag(res.headers.get("etag")) ?? dto.docVersion } };
  }
  if (res.status === 402) return { kind: "locked" };
  const p = (await readJson<Problem>(res)) ?? {};
  if (res.status === 409 && p.code === "PROPOSAL_STALE") return { kind: "stale" };
  if (res.status === 409 && p.code === "PROPOSAL_CLOSED") return { kind: "closed" };
  if (res.status === 422 && p.code === "PLACEHOLDER_REMAINS") return { kind: "placeholder" };
  if (res.status === 400 && p.code === "KEEP_EMPTY") return { kind: "keepEmpty" };
  if (res.status === 401) return { kind: "error", status: 401, message: "Your session expired. Sign in again." };
  if (res.status === 404) return { kind: "error", status: 404, message: "That suggestion is no longer there." };
  return { kind: "error", status: res.status, message: p.error ?? "Couldn't apply that. Try again." };
}

/** `POST /api/ai/proposals/:pid/dismiss`. Best effort: a failure is not worth telling the person about. */
export async function dismissProposal(proposalId: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/ai/proposals/${proposalId}/dismiss`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

/** `GET /api/resumes/:id/ai/proposals`: this resume's open proposals (no AI call). Empty on any failure. */
export async function listOpenProposals(resumeId: number): Promise<AiProposal[]> {
  try {
    const res = await fetch(`/api/resumes/${resumeId}/ai/proposals`, { cache: "no-store" });
    if (!res.ok) return [];
    const list = await readJson<AiProposal[]>(res);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/* ── the sentences the UI shows (DESIGN 13.1 "UI copy for refusals", 13.6, 13.7) ─────────────────── */

export const COPY = {
  locked: "AI rewriting is part of Pro",
  lockedBody: "Pro rewrites any line in the tone you pick, and you accept each change yourself.",
  disabled: "Kiwiply AI is taking a short break.",
  disabledBody: "Everything else in the builder keeps working. Try again in a little while.",
  consent: "Send this to Kiwiply AI?",
  consentBody: "Only the text of the lines you chose and the rest of your resume text are sent, never your name, email, phone or links.",
  nothing: "Nothing to change",
  nothingBody: "Every rewrite we tried would have changed or added a fact, so we kept your facts safe and left the lines alone.",
  stale: "Your resume changed since this was made",
  staleBody: "Rewrites are made from the version you had. Ask again to rewrite what is there now.",
  placeholder: "Replace [add a number] before applying",
  formatted: "Formatting on this line will be reset",
} as const;

const longDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
};

/** "This period's Kiwiply AI is used up - resets <date>..." / the daily cap sentence. */
export function quotaSentence(usage: AiUsageView | undefined, cap: string | undefined): { title: string; body: string } {
  if (cap === "daily") {
    return {
      title: "That's today's AI rewrites",
      body: "You've reached the daily limit. It resets tomorrow, and repeats of things you've already asked are free.",
    };
  }
  const when = longDate(usage?.resetsAt);
  return {
    title: "This period's Kiwiply AI is used up",
    body: `${when ? `It resets ${when}.` : "It resets when your plan renews."} Repeats of things you've already asked are free.`,
  };
}

/** The meter line under a proposal: percent used for the paid budget, the day's count for the daily cap. Null when unknown. */
export function usageLine(usage: AiUsageView | undefined, cap?: string): string | null {
  if (!usage) return null;
  const when = longDate(usage.resetsAt);
  if (cap === "daily") return `${usage.used} of ${usage.limit} AI rewrites used today`;
  const pct = Math.min(100, Math.max(0, Math.round(usage.limit > 0 ? (usage.used / usage.limit) * 100 : usage.used)));
  return `${pct}% of your Kiwiply AI used${when ? ` · resets ${when}` : ""}${usage.economy ? " · lighter model now" : ""}`;
}
