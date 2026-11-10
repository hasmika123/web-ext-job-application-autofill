/**
 * The duplicate and cap guards as the marketing pages see them (Sprint 2 / B1). The API refuses a new assignment or a recorded submission or
 * application with a 409 and a code:
 *  - DUPLICATE_WARNING: the same role is already in front of the consultant. The marketer may go ahead by confirming with a reason (1 to 200 characters);
 *  - DUPLICATE_BLOCKED: the organization's policy is BLOCK, so nothing overrides it;
 *  - ASSIGNMENT_CAP: the consultant already holds the most open opportunities the organization allows.
 * One place for the codes, the wire shape of a confirmation and the plain sentences, so every flow (Opportunities, Matches, Jobs, Submissions, Applications)
 * answers the same way. Nothing here submits anything for a consultant (E1).
 */

/** One reason the API gives for calling an assignment a duplicate (rule SAME_POSTING, SAME_JOB, VENDOR_CHAIN or TOO_MANY_CONSULTANTS). */
export interface DuplicateFinding { rule: string; message: string }

export const DUPLICATE_WARNING = "DUPLICATE_WARNING";
export const DUPLICATE_BLOCKED = "DUPLICATE_BLOCKED";
export const ASSIGNMENT_CAP = "ASSIGNMENT_CAP";

/** The longest reason the API takes. */
export const DUPLICATE_REASON_MAX = 200;

/** The answer to a duplicate warning: the marketer confirms and says why (1 to 200 characters). */
export interface DuplicateConfirm { reason: string }

/** The two body fields that carry a confirmation; empty when there is none, so a plain call stays exactly as it was. */
export const confirmFields = (confirm?: DuplicateConfirm): { confirmDuplicate?: true; duplicateReason?: string } =>
  confirm ? { confirmDuplicate: true, duplicateReason: confirm.reason } : {};

/** What a refused call carries for the guards: the API's code and sentence, and the findings when it sent them. */
export interface GuardRefusal { code: string | null; error: string; findings?: DuplicateFinding[] }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The findings of a 409 body, ignoring anything that is not `{ rule, message }`. */
export function findingsOf(x: unknown): DuplicateFinding[] {
  if (!Array.isArray(x)) return [];
  return x.filter(isObj).map((f) => ({ rule: typeof f.rule === "string" ? f.rule : "", message: typeof f.message === "string" ? f.message : "" })).filter((f) => f.message);
}

/** True when the marketer can still go ahead by giving a reason. */
export const isDuplicateWarning = (r: { code: string | null }): boolean => r.code === DUPLICATE_WARNING;

const FALLBACK: Record<string, string> = {
  [DUPLICATE_BLOCKED]: "This consultant already has the same role, and your organization does not allow that.",
  [ASSIGNMENT_CAP]: "This consultant already has the most open opportunities your organization allows.",
};

/**
 * The sentence to show for a refusal that has nothing to confirm (a block or the open-opportunity limit): the API's own words, or a plain fallback when it
 * sent none. Any other refusal keeps its own sentence.
 */
export function plainRefusal(r: { code: string | null; error: string }): string {
  const fallback = r.code ? FALLBACK[r.code] : undefined;
  return r.error.trim() ? r.error : fallback ?? "That didn't work. Nothing has changed.";
}

/** A reason is valid when it has text and fits the API's limit. */
export const reasonOk = (reason: string): boolean => reason.trim().length > 0 && reason.trim().length <= DUPLICATE_REASON_MAX;
