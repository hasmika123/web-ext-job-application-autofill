/**
 * The create-org flow's rules, with no React in them (O2.1, onboarding-invites.md section 2): what each screen needs before
 * Continue is on, what the API's problem codes mean for the screen the person is on, and the draft that survives a reload.
 */
import { deriveSlug, isWellFormedSlug } from "@/lib/org-slug";
import type { OrgProblem } from "@/lib/org-api";
import type { OrgType } from "@/lib/org-types";

export const NAME_MAX = 120;

export const TYPE_OPTIONS: { value: OrgType; label: string }[] = [
  { value: "BOOTCAMP", label: "Bootcamp" },
  { value: "SCHOOL", label: "University" },
  { value: "COMPANY", label: "Company" },
  { value: "OUTPLACEMENT", label: "Outplacement" },
  { value: "CONSULTANCY", label: "Staffing / consultancy" },
];

export const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "1_50", label: "1–50" },
  { value: "51_200", label: "51–200" },
  { value: "201_500", label: "201–500" },
  { value: "501_1000", label: "501–1,000" },
  { value: "1001_PLUS", label: "1,001+" },
];

/** Schools and bootcamps assert that everyone they invite is 16 or older (consent-data-sharing.md section 1.6). */
export function attestationRequired(type: OrgType | ""): boolean {
  return type === "SCHOOL" || type === "BOOTCAMP";
}

export interface CreateDraft {
  name: string;
  type: OrgType | "";
  /** The address, as typed or derived. */
  slug: string;
  /** True once the person edited the address themselves: the name stops rewriting it. */
  slugEdited: boolean;
  sizeBand: string;
  country: string;
  attest16: boolean;
}

export const EMPTY_DRAFT: CreateDraft = { name: "", type: "", slug: "", slugEdited: false, sizeBand: "", country: "", attest16: false };

/** The name changed: the address follows it until the person edits the address. */
export function withName(d: CreateDraft, name: string): CreateDraft {
  return { ...d, name, slug: d.slugEdited ? d.slug : name.trim() ? deriveSlug(name) : "" };
}

export interface StepErrors {
  [field: string]: string | undefined;
}

export function step1Errors(d: CreateDraft): StepErrors {
  const e: StepErrors = {};
  const name = d.name.trim();
  if (!name) e.name = "Add your organization's name.";
  else if (name.length > NAME_MAX) e.name = `Keep it to ${NAME_MAX} characters or fewer.`;
  if (!d.type) e.type = "Pick the closest match.";
  if (name && !isWellFormedSlug(d.slug)) e.slug = "Use 3 to 60 letters, numbers or dashes.";
  return e;
}

export function step2Errors(d: CreateDraft): StepErrors {
  const e: StepErrors = {};
  if (!d.sizeBand) e.sizeBand = "Pick a range. A rough guess is fine.";
  if (!d.country) e.country = "Pick your country.";
  if (attestationRequired(d.type) && !d.attest16) e.attest16 = "Please confirm this to continue.";
  return e;
}

export const hasErrors = (e: StepErrors) => Object.values(e).some(Boolean);

/** Which screen a refused create belongs on, and what to say there. */
export interface CreateFailure {
  step: 1 | 2;
  field: string;
  message: string;
  /** SLUG_TAKEN: the address the API offers instead. */
  suggestion?: string;
}

export function failureOf(p: OrgProblem): CreateFailure {
  switch (p.code) {
    case "SLUG_TAKEN":
      return { step: 1, field: "slug", message: "That address is taken.", suggestion: p.suggestion };
    case "SENSITIVE_CONTENT":
      return { step: 1, field: "name", message: "That looks like a number we never collect. Use your organization's name." };
    case "RESERVED_VALUE":
      return { step: 1, field: "type", message: "That type isn't available yet. Pick another." };
    case "ORG_LIMIT_REACHED":
      return { step: 2, field: "form", message: `You've reached the limit of ${p.max ?? "a few"} workspaces. Open one of yours instead.` };
    case "DEMO_READ_ONLY":
      return { step: 2, field: "form", message: "This is a demo account - changes aren't saved." };
    case "ORG_INVALID":
      if (p.field === "name" || p.field === "slug" || p.field === "type") return { step: 1, field: p.field, message: friendlyInvalid(p) };
      if (p.field === "sizeBand" || p.field === "country") return { step: 2, field: p.field, message: friendlyInvalid(p) };
      return { step: 2, field: "form", message: "Something about those answers wasn't accepted. Check them and try again." };
    case "NETWORK":
      return { step: 2, field: "form", message: "Couldn't reach the server. Check your connection and try again." };
    default:
      return { step: 2, field: "form", message: "Couldn't create the workspace. Try again in a moment." };
  }
}

function friendlyInvalid(p: OrgProblem): string {
  if (p.field === "slug") return "Use 3 to 60 letters, numbers or dashes.";
  if (p.field === "name") return "Add your organization's name.";
  if (p.field === "type") return "Pick the closest match.";
  return "That wasn't accepted. Check it and try again.";
}

// ---- the draft survives a reload (sessionStorage; every access is guarded, the flow works without it) ------------------

export const DRAFT_KEY = "kiwiply.org-new.draft";

export interface StoredDraft {
  step: 1 | 2;
  draft: CreateDraft;
}

export function loadDraft(storage: Pick<Storage, "getItem"> | null): StoredDraft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!v || (v.step !== 1 && v.step !== 2) || !v.draft || typeof v.draft.name !== "string") return null;
    return { step: v.step, draft: { ...EMPTY_DRAFT, ...v.draft } };
  } catch {
    return null;
  }
}

export function saveDraft(storage: Pick<Storage, "setItem" | "removeItem"> | null, value: StoredDraft | null): void {
  try {
    if (!storage) return;
    if (value) storage.setItem(DRAFT_KEY, JSON.stringify(value));
    else storage.removeItem(DRAFT_KEY);
  } catch {
    // private window or blocked storage: the flow simply does not remember
  }
}
