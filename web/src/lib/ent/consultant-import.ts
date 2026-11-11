/**
 * Importing consultants from a CSV (docs/enterprise-v2/ONBOARDING-BUILD.md, gap A3). The browser reads the file (this module: a small RFC 4180 reader,
 * header matching by name in any order, a template); the API checks every row with the rules of "Add consultant" and, on Apply, creates the READY
 * rows and invites the ticked ones. Resumes are not imported: each consultant adds their own after joining.
 */

export const MAX_ROWS = 500;

export interface ImportRow {
  name: string;
  email: string;
  jobTitle: string;
  location: string;
  workMode: string;
  years: string;
  skills: string[];
  department: string;
  invite: boolean;
}

export type RowStatus = "READY" | "INVALID" | "DUPLICATE" | "SENSITIVE";
export type InviteVerdict = "WILL_INVITE" | "NOT_ASKED" | "ALREADY_MEMBER" | "NO_PERMISSION";
export interface Verdict { row: number; email: string; status: RowStatus; field: string | null; message: string | null; invite: InviteVerdict | null }
export interface CheckResult { total: number; ready: number; rows: Verdict[] }
export interface AppliedRow { row: number; email: string; outcome: "CREATED" | "SKIPPED"; invited: boolean; message: string | null }
export interface ApplyResult { added: number; invited: number; skipped: number; rows: AppliedRow[] }

export type Read = { ok: true; rows: ImportRow[]; unknownColumns: string[] } | { ok: false; message: string };
export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

/** The columns, by the names a sheet is likely to use (matched without case, spaces or punctuation). */
const COLUMNS: Record<keyof Omit<ImportRow, "invite" | "skills"> | "skills", string[]> = {
  name: ["name", "fullname", "displayname", "consultant", "consultantname"],
  email: ["email", "emailaddress", "mail"],
  jobTitle: ["jobtitle", "title", "role", "position"],
  location: ["location", "city", "citystate"],
  workMode: ["workmode", "mode", "worktype", "remote"],
  years: ["years", "yearsexperience", "experience", "yearsofexperience", "yoe"],
  skills: ["skills", "skill", "primaryskills"],
  department: ["department", "dept", "practice"],
};

export const TEMPLATE = "name,email,job title,location,work mode,years,skills,department\nAnika Rao,anika.rao@example.com,Java Developer,\"Austin, TX\",Remote,6,Java; Spring Boot; AWS,Engineering\n";

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

/** RFC 4180 cells: commas, quoted cells with "" escapes and line breaks inside quotes, CRLF or LF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** The file as import rows: the header row names the columns; `inviteAll` ticks every row. */
export function readImport(text: string, inviteAll: boolean): Read {
  const cells = parseCsv(text);
  if (cells.length < 2) return { ok: false, message: "The file needs a header row and at least one consultant." };
  const header = cells[0].map((h) => norm(h));
  const index: Partial<Record<keyof typeof COLUMNS, number>> = {};
  const unknownColumns: string[] = [];
  header.forEach((h, i) => {
    const key = (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).find((k) => COLUMNS[k].includes(h));
    if (key && index[key] === undefined) index[key] = i;
    else if (h) unknownColumns.push(cells[0][i].trim());
  });
  if (index.name === undefined || index.email === undefined) return { ok: false, message: "The file needs a \"name\" and an \"email\" column. Download the template to see the layout." };
  const body = cells.slice(1);
  if (body.length > MAX_ROWS) return { ok: false, message: `At most ${MAX_ROWS} consultants per file. Split it and import the parts one after another.` };
  const at = (r: string[], k: keyof typeof COLUMNS) => (index[k] === undefined ? "" : (r[index[k]!] ?? "").trim());
  const rows = body.map((r) => ({
    name: at(r, "name"),
    email: at(r, "email"),
    jobTitle: at(r, "jobTitle"),
    location: at(r, "location"),
    workMode: at(r, "workMode"),
    years: at(r, "years"),
    skills: at(r, "skills").split(/[;|]/).map((s) => s.trim()).filter(Boolean),
    department: at(r, "department"),
    invite: inviteAll,
  }));
  return { ok: true, rows, unknownColumns };
}

/** The verdict's words for the review table. */
export const STATUS_LABEL: Record<RowStatus, string> = { READY: "Ready", INVALID: "Needs a fix", DUPLICATE: "Already here", SENSITIVE: "Refused" };
export const INVITE_LABEL: Record<InviteVerdict, string> = {
  WILL_INVITE: "Will be invited",
  NOT_ASKED: "Not invited",
  ALREADY_MEMBER: "Already a member or invited",
  NO_PERMISSION: "You can't send invitations",
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const STATUSES: readonly RowStatus[] = ["READY", "INVALID", "DUPLICATE", "SENSITIVE"];
const INVITES: readonly InviteVerdict[] = ["WILL_INVITE", "NOT_ASKED", "ALREADY_MEMBER", "NO_PERMISSION"];

export function parseCheck(raw: unknown): CheckResult | null {
  if (!isObj(raw)) return null;
  return {
    total: num(raw.total),
    ready: num(raw.ready),
    rows: arr(raw.rows).map((r) => ({
      row: num(r.row),
      email: str(r.email) ?? "",
      status: STATUSES.includes(r.status as RowStatus) ? (r.status as RowStatus) : "INVALID",
      field: str(r.field),
      message: str(r.message),
      invite: INVITES.includes(r.invite as InviteVerdict) ? (r.invite as InviteVerdict) : null,
    })),
  };
}

export function parseApply(raw: unknown): ApplyResult | null {
  if (!isObj(raw)) return null;
  return {
    added: num(raw.added),
    invited: num(raw.invited),
    skipped: num(raw.skipped),
    rows: arr(raw.rows).map((r) => ({ row: num(r.row), email: str(r.email) ?? "", outcome: r.outcome === "CREATED" ? "CREATED" : "SKIPPED", invited: r.invited === true, message: str(r.message) })),
  };
}

async function post<T>(url: string, body: unknown, parse: (raw: unknown) => T | null, headers: Record<string, string> = {}): Promise<Outcome<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", ...headers }, body: JSON.stringify(body), cache: "no-store" });
    const data: unknown = await res.json().catch(() => null);
    const d = isObj(data) ? data : {};
    if (!res.ok) return { ok: false, message: str(d.error) ?? str(d.detail) ?? "That didn't work. Nothing was changed." };
    const value = parse(data);
    return value ? { ok: true, value } : { ok: false, message: "That didn't work. Nothing was changed." };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check your connection." };
  }
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/consultants/import`;

export const checkImport = (orgId: number | string, rows: ImportRow[]) => post(`${base(orgId)}/check`, { rows }, parseCheck);
export const applyImport = (orgId: number | string, rows: ImportRow[], key: string) => post(base(orgId), { rows }, parseApply, { "Idempotency-Key": key });
