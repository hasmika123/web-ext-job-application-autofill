/**
 * The Accounts workspace Submissions page: the types of the read-only submissions API (`OrgSubmissionResource`) and the client for the BFF under
 * `/api/orgs/{orgId}/submissions`. These are RECORDS (who, which requirement and client, where it stands). There is no write call here on purpose:
 * the consultant submits, the marketer records the fact, and Kiwiply never submits.
 */
import type { ApiResult } from "@/lib/ent/placements";

export type SubmissionStatus = "DRAFT" | "SUBMITTED" | "CLIENT_REVIEW" | "INTERVIEW_REQUESTED" | "REJECTED";

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CLIENT_REVIEW: "Client review",
  INTERVIEW_REQUESTED: "Interview requested",
  REJECTED: "Rejected",
};
export const STATUS_TONE: Record<SubmissionStatus, "grey" | "blue" | "amber" | "green" | "red"> = {
  DRAFT: "grey",
  SUBMITTED: "blue",
  CLIENT_REVIEW: "amber",
  INTERVIEW_REQUESTED: "green",
  REJECTED: "red",
};
export const STATUS_ORDER: SubmissionStatus[] = ["SUBMITTED", "CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED", "DRAFT"];

export const APPROVAL_LABEL: Record<string, string> = { DRAFT: "Not sent for approval", AWAITING_APPROVAL: "Waiting for the consultant", APPROVED: "Approved by the consultant", REJECTED: "Not approved" };

export interface SubmissionRow {
  id: number;
  code: string;
  consultant: { id: number; name: string; initials: string };
  clientId: number;
  clientName: string;
  requirementId: number;
  requirementTitle: string;
  status: SubmissionStatus;
  approvalState: string;
  submittedOn: string | null;
  preparedBy: string | null;
  note: string | null;
  createdAt: string;
}

export interface SubmissionPage {
  items: SubmissionRow[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface SubmissionCounts {
  total: number;
  byStatus: Record<string, number>;
  awaitingApproval: number;
}

export interface SubmissionView {
  status: SubmissionStatus | "";
  q: string;
  /** 0-based, as the API counts. */
  page: number;
}

export const SUBMISSION_PAGE_SIZE = 10; // config-literal-ok: the table's page size (UI paging; the API caps it)

export function parseSubmissionView(params: URLSearchParams): SubmissionView {
  const st = params.get("status") ?? "";
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    status: (STATUS_ORDER as string[]).includes(st) ? (st as SubmissionStatus) : "",
    q: (params.get("q") ?? "").slice(0, 80),
    page: Number.isFinite(page) && page >= 1 ? page - 1 : 0,
  };
}

export function submissionViewParams(v: SubmissionView): string {
  const p = new URLSearchParams();
  if (v.status) p.set("status", v.status);
  if (v.q) p.set("q", v.q);
  if (v.page > 0) p.set("page", String(v.page + 1));
  return p.toString();
}

export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No submissions";
  return `${page * size + 1}-${page * size + shown} of ${total.toLocaleString("en-US")} ${total === 1 ? "submission" : "submissions"}`;
}

export function errorSentence(r: { status: number; message: string }): string {
  if (r.status === 0) return r.message;
  if (r.status === 404) return "These submissions are not in your view.";
  return r.message;
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/submissions`;

async function call<T>(url: string): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection.", extra: {} };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T, status: res.status };
  const { error, message, code, ...extra } = body;
  return { ok: false, status: res.status, code: typeof code === "string" ? code : undefined, message: typeof error === "string" ? error : typeof message === "string" ? message : "Something went wrong.", extra };
}

export const submissionsApi = {
  list: (orgId: number | string, v: SubmissionView) => {
    const p = new URLSearchParams({ page: String(v.page), size: String(SUBMISSION_PAGE_SIZE) });
    if (v.status) p.set("status", v.status);
    if (v.q.trim().length >= 2) p.set("q", v.q.trim());
    return call<SubmissionPage>(`${base(orgId)}?${p.toString()}`);
  },
  counts: (orgId: number | string) => call<SubmissionCounts>(`${base(orgId)}/counts`),
};
