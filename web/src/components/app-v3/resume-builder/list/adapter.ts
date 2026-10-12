/**
 * THE seam between the API's resume list DTO and the "My Resumes" board.
 *
 * Every mapping decision lives in this one file: the components only ever see a `ResumeCardModel`.
 * The list DTO carries the resume metadata model (R3.9, DESIGN 8.6): `lifecycle`, `updatedAt`, `primary`,
 * `target`, `tags`, `role`. The rules (each one is covered by adapter.test.ts):
 *  - status: the server's `lifecycle` (ARCHIVED / DRAFT / ACTIVE). A DTO without one (an API from before
 *    R3.9) falls back to archived-or-active.
 *  - isPrimary: `primary` (else `defaultResume`, the same value), never on an archived resume.
 *  - createdAt: the DTO's `createdAt`, or null (the card hides the row when it is null).
 *  - modifiedAt: the DTO's `updatedAt`; rows that predate it have none, so `createdAt`, else null.
 *  - tags: the resume's own tags. Only an API from before R3.9 (no `tags` field at all) falls back to the
 *    kind ("Built" / "Uploaded").
 *  - target: the role the resume aims at (searchable; the card has no slot for it yet).
 *  - atsFriendly: only when the template registry marks the resume's template ATS-safe; unknown for
 *    uploads (no template) so the chip is not shown.
 *  - pdfState: BUILT resumes only. The API's PDF job state wins (R3.7: PENDING/RUNNING/STALE -> updating, FAILED ->
 *    failed, READY -> current); an API that does not report it falls back to stored hash vs content hash.
 */
import { hasTemplate, getTemplate } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import { pdfOutOfDate } from "@/lib/resume-doc";

/** The card statuses on the board. `Primary` is not a status: it is `isPrimary` on an Active resume. */
export type ResumeStatus = "Active" | "Draft" | "Archived";

/**
 * `current`: the stored PDF matches the document. `updating`: the PDF job is pending / running / behind the
 * document (R3.7). `failed`: the PDF job gave up. `outOfDate`: edited since the PDF was made, on an API that
 * does not report the job state. `none`: never exported / not applicable.
 */
export type PdfState = "current" | "updating" | "failed" | "outOfDate" | "none";

export interface ResumeCardModel {
  id: number;
  name: string;
  status: ResumeStatus;
  isPrimary: boolean;
  /** ISO timestamp, or null when the API doesn't say. */
  createdAt: string | null;
  /** ISO timestamp, or null when neither a modified nor a created time is known. */
  modifiedAt: string | null;
  tags: string[];
  /** The role this resume aims at (`resume.target`), or null. */
  target: string | null;
  /** The template registry key, or null for uploaded files (they have no template, so no thumbnail). */
  templateId: string | null;
  /** `true` only when the template registry marks the template ATS-safe. `undefined` = unknown (no chip). */
  atsFriendly?: boolean;
  pdfState: PdfState;
  /** Built in the Resume Builder (opens the editor) or an uploaded file. */
  kind: "BUILT" | "UPLOADED";
}

/** A DTO as the list receives it. */
export type ResumeDto = Resume;

const blank = (s?: string | null) => (typeof s === "string" && s.trim() !== "" ? s : null);

function statusOf(r: ResumeDto): ResumeStatus {
  if (r.lifecycle === "ARCHIVED") return "Archived";
  if (r.lifecycle === "DRAFT") return "Draft";
  if (r.lifecycle === "ACTIVE") return "Active";
  return r.archived ? "Archived" : "Active";
}

export function toCardModel(r: ResumeDto): ResumeCardModel {
  const kind = r.kind === "BUILT" ? "BUILT" : "UPLOADED";
  const templateId = kind === "BUILT" && blank(r.templateId) ? (r.templateId as string) : null;
  const createdAt = blank(r.createdAt);

  let atsFriendly: boolean | undefined;
  if (templateId && hasTemplate(templateId)) atsFriendly = getTemplate(templateId).meta.capabilities.ats;

  const status: ResumeStatus = statusOf(r);

  return {
    id: r.id,
    name: blank(r.label) ?? "Untitled resume",
    status,
    isPrimary: !!(r.primary ?? r.defaultResume) && status !== "Archived",
    createdAt,
    modifiedAt: blank(r.updatedAt) ?? createdAt,
    tags: Array.isArray(r.tags) ? r.tags : [kind === "BUILT" ? "Built" : "Uploaded"],
    target: blank(r.target),
    templateId,
    atsFriendly,
    pdfState: pdfStateOf(r, kind),
    kind,
  };
}

/** The job state the API reports (R3.7) wins; an older API falls back to comparing the stored hash with the content hash. */
function pdfStateOf(r: ResumeDto, kind: "BUILT" | "UPLOADED"): PdfState {
  if (kind !== "BUILT") return "none";
  switch (r.pdf?.status) {
    case "PENDING":
    case "RUNNING":
    case "STALE":
      return "updating";
    case "FAILED":
      return "failed";
    case "READY":
      return "current";
    case "NONE":
      return "none";
  }
  return !r.exportedHash ? "none" : pdfOutOfDate(r) ? "outOfDate" : "current";
}

export const toCardModels = (rs: ResumeDto[]): ResumeCardModel[] => rs.map(toCardModel);
