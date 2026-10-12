/**
 * THE seam between the API's resume list DTO and the "My Resumes" board.
 *
 * The board (design/resume-builder-v3/user-my-resumes.webp) shows more than the DTO carries today
 * (Draft status, created/modified dates, role/level tags, an "ATS Friendly" chip). The resume
 * metadata model that supplies those is still being designed, so EVERY mapping decision lives in this
 * one file: the components only ever see a `ResumeCardModel`. When the metadata model lands, change
 * `toCardModel` (and nothing else) and the page follows.
 *
 * Interim rules (each one is covered by adapter.test.ts):
 *  - status: `Archived` when the DTO says archived, otherwise `Active`. `Draft` is never produced yet,
 *    so the Drafts tab shows 0 with its empty state.
 *  - isPrimary: `defaultResume` (the API's "default resume").
 *  - createdAt: the DTO's `createdAt`, or null (the card hides the row when it is null).
 *  - modifiedAt: the DTO has no last-modified time on the list yet, so `updatedAt` when the API sends it,
 *    else `createdAt`, else null (the card hides the row when it is null).
 *  - tags: the resume's kind ("Built" / "Uploaded"); real role/level tags arrive with the metadata model.
 *  - atsFriendly: only when the template registry marks the resume's template ATS-safe; unknown for
 *    uploads (no template) so the chip is not shown.
 *  - pdfState: BUILT resumes only, exported hash vs content hash (same rule as the editor's "PDF out of date").
 */
import { hasTemplate, getTemplate } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import { pdfOutOfDate } from "@/lib/resume-doc";

/** The card statuses on the board. `Primary` is not a status: it is `isPrimary` on an Active resume. */
export type ResumeStatus = "Active" | "Draft" | "Archived";

/** `current`: the stored PDF matches the document. `outOfDate`: edited since the PDF was made. `none`: never exported / not applicable. */
export type PdfState = "current" | "outOfDate" | "none";

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
  /** The template registry key, or null for uploaded files (they have no template, so no thumbnail). */
  templateId: string | null;
  /** `true` only when the template registry marks the template ATS-safe. `undefined` = unknown (no chip). */
  atsFriendly?: boolean;
  pdfState: PdfState;
  /** Built in the Resume Builder (opens the editor) or an uploaded file. */
  kind: "BUILT" | "UPLOADED";
}

/** A DTO as the list receives it: `updatedAt` is optional because `ResumeDTO` does not carry it yet. */
export type ResumeDto = Resume & { updatedAt?: string | null };

const blank = (s?: string | null) => (typeof s === "string" && s.trim() !== "" ? s : null);

export function toCardModel(r: ResumeDto): ResumeCardModel {
  const kind = r.kind === "BUILT" ? "BUILT" : "UPLOADED";
  const templateId = kind === "BUILT" && blank(r.templateId) ? (r.templateId as string) : null;
  const createdAt = blank(r.createdAt);

  let atsFriendly: boolean | undefined;
  if (templateId && hasTemplate(templateId)) atsFriendly = getTemplate(templateId).meta.atsSafe === true;

  const pdfState: PdfState = kind !== "BUILT" || !r.exportedHash ? "none" : pdfOutOfDate(r) ? "outOfDate" : "current";

  return {
    id: r.id,
    name: blank(r.label) ?? "Untitled resume",
    status: r.archived ? "Archived" : "Active",
    isPrimary: !!r.defaultResume && !r.archived,
    createdAt,
    modifiedAt: blank(r.updatedAt) ?? createdAt,
    tags: [kind === "BUILT" ? "Built" : "Uploaded"],
    templateId,
    atsFriendly,
    pdfState,
    kind,
  };
}

export const toCardModels = (rs: ResumeDto[]): ResumeCardModel[] => rs.map(toCardModel);
