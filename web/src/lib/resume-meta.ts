/**
 * Client-side shapes and calls for a resume's metadata, lineage, versions and sharing (Resume Builder R3.9 /
 * R3.10 / R3.11, DESIGN 9.7, 9.10, 9.11): what the header bar sends to the `/api/resumes/**` BFF routes. Spring
 * owns every rule (name length, exactly-one primary, link limits); this file only types the answers and turns
 * the refusals into a short sentence. Every call returns a tagged result and never throws.
 */
import type { PdfInfo, ResumeDocDTO } from "./resume-doc";
import { parseEtag } from "./resume-doc";

/** Who made or last wrote a resume: the login and the name to show. */
export interface ResumeActor {
  login: string;
  label: string;
}

export type ResumeRole = "MASTER" | "TAILORED";
export type VisibilityMode = "PRIVATE" | "ORG" | "PEOPLE";

export interface ResumeMeta {
  id: number;
  name: string;
  kind: "BUILT" | "UPLOADED";
  source: {
    kind: string;
    origin: string | null;
    tailoredFrom: { resumeId: number; label: string; job: { title: string; company: string } | null } | null;
    madeBy: string | null;
    approvalRequired: boolean;
    approvedAt: string | null;
  };
  target: string | null;
  tags: string[];
  primary: boolean;
  starred: boolean;
  archived: boolean;
  /** ARCHIVED | DRAFT | ACTIVE. */
  lifecycle: string;
  role: ResumeRole;
  templateId: string | null;
  createdAt: string | null;
  createdBy: ResumeActor | null;
  updatedAt: string | null;
  updatedBy: ResumeActor | null;
  lastExportedAt: string | null;
  score: number | null;
  pdf: PdfInfo | null;
  shareWithOrg: boolean;
  lineage: { masterId: number; masterName: string; masterChanged: boolean; children: number };
  visibility: { mode: VisibilityMode; orgPaired: string | null; orgScope: string | null; shareWithOrg: boolean; people: number };
  recruiterSharing: { on: boolean; links: number; views: number };
  version: { current: number; latest: { name: string | null; createdAt: string; kind: string } | null };
  /** Made from an uploaded file that is kept: `GET /api/resumes/:id/original` downloads it (R2.6). */
  hasOriginal?: boolean;
}

/** `GET …/lineage`: the family of a resume. `self` is this resume's role. */
export interface ResumeLineage {
  master: { id: number; name: string; updatedAt: string | null };
  children: Array<{ id: number; name: string; job: { title: string; company: string } | null; updatedAt: string | null; masterChanged: boolean }>;
  self: ResumeRole;
}

/** One row of the version history. `kind`: auto | named | checkpoint | system. */
export interface ResumeVersion {
  versionNo: number;
  reason: string;
  name: string | null;
  createdAt: string;
  contentHash: string;
  by: ResumeActor | null;
  kind: "auto" | "named" | "checkpoint" | "system";
}

/** One share grant. A LINK carries `url` and `allowDownload`; a USER carries `login` and `name`. */
export interface AccessGrant {
  id: number;
  subjectType: "USER" | "LINK";
  login?: string;
  name?: string;
  role: string;
  label?: string;
  allowDownload?: boolean;
  expiresAt?: string | null;
  expired: boolean;
  createdAt: string;
  viewCount: number;
  lastViewedAt?: string | null;
  url?: string;
}

export interface AccessOverview {
  org: { scope: string; pairedWith: string | null; shareWithOrg: boolean } | null;
  grants: AccessGrant[];
  links: AccessGrant[];
  viewers: number;
}

/** One difference between a tailored resume and its master (`sync-master`): applied by `id`. */
export interface SyncChange {
  id: string;
  kind: "added" | "changed" | "removed";
  section: string;
  before?: unknown;
  after?: unknown;
}

export type Res<T> = { kind: "ok"; value: T } | { kind: "error"; status: number; code?: string; message: string };

interface Problem {
  code?: string;
  message?: string;
  detail?: string;
  error?: string;
  title?: string;
}

const NETWORK: Res<never> = { kind: "error", status: 0, message: "Couldn't reach the server." };

async function problem(res: Response, fallback: string): Promise<Res<never>> {
  let p: Problem = {};
  try {
    p = (await res.json()) as Problem;
  } catch {
    /* not JSON */
  }
  const text = [p.detail, p.message, p.error].find((s) => typeof s === "string" && s.trim() !== "" && s !== "error.resumeDoc");
  return { kind: "error", status: res.status, code: p.code, message: res.status === 401 ? "Your session expired. Sign in again." : (text ?? fallback) };
}

async function call<T>(url: string, init: RequestInit | undefined, fallback: string, read: (res: Response) => Promise<T>): Promise<Res<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return NETWORK;
  }
  if (!res.ok) return problem(res, fallback);
  try {
    return { kind: "ok", value: await read(res) };
  } catch {
    return { kind: "error", status: res.status, message: fallback };
  }
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const jsonRes = <T>(res: Response) => res.json() as Promise<T>;
const base = (id: number) => `/api/resumes/${id}`;

export const getMeta = (id: number) => call<ResumeMeta>(`${base(id)}/meta`, undefined, "Couldn't load this resume's details.", jsonRes);

/** `PATCH …/meta`: `{name, target, tags, primary, starred, archived, shareWithOrg, visibility: "PRIVATE", recruiterSharing}`. */
export const patchMeta = (id: number, patch: Record<string, unknown>) =>
  call<ResumeMeta>(`${base(id)}/meta`, { ...json(patch), method: "PATCH" }, "Couldn't save that change.", jsonRes);

export const getLineage = (id: number) => call<ResumeLineage>(`${base(id)}/lineage`, undefined, "Couldn't load the tailored versions.", jsonRes);

export const detachResume = (id: number) => call<ResumeMeta>(`${base(id)}/detach`, { method: "POST" }, "Couldn't make this a master.", jsonRes);

export const createCheckpoint = (id: number, name?: string) =>
  call<{ versionNo: number; reason: string; pdf: PdfInfo | null }>(`${base(id)}/doc/checkpoint`, json(name ? { name } : {}), "Couldn't save the version.", jsonRes);

export const listVersions = (id: number) => call<ResumeVersion[]>(`${base(id)}/doc/versions`, undefined, "Couldn't load the versions.", jsonRes);

export const getVersionText = (id: number, versionNo: number) =>
  call<string>(`${base(id)}/doc/versions/${versionNo}/text`, undefined, "Couldn't load that version.", (r) => r.text());

/** `POST …/doc/versions/:n/restore`: the restored document, with the version the next save must send. */
export const restoreVersion = (id: number, versionNo: number) =>
  call<ResumeDocDTO>(`${base(id)}/doc/versions/${versionNo}/restore`, { method: "POST" }, "Couldn't restore that version.", async (r) => {
    const dto = await jsonRes<ResumeDocDTO>(r);
    return { ...dto, docVersion: parseEtag(r.headers.get("etag")) ?? dto.docVersion };
  });

/** `DELETE /api/resumes/:id`. A 409 (an application uses it) comes back as its own sentence: archive it instead. */
export const deleteResume = (id: number) => call<null>(`${base(id)}`, { method: "DELETE" }, "Couldn't delete this resume.", async () => null);

export const getAccess =(id: number) => call<AccessOverview>(`${base(id)}/access`, undefined, "Couldn't load who can see this resume.", jsonRes);

export const createLink = (id: number, body: { expiresAt?: string; label?: string; allowDownload?: boolean } = {}) =>
  call<AccessGrant>(`${base(id)}/access/link`, json(body), "Couldn't create the link.", jsonRes);

export const revokeAccess = (id: number, accessId: number) =>
  call<null>(`${base(id)}/access/${accessId}`, { method: "DELETE" }, "Couldn't revoke that access.", async () => null);

export const setLinkDownload = (id: number, accessId: number, allowDownload: boolean) =>
  call<AccessGrant>(`${base(id)}/access/${accessId}`, { ...json({ allowDownload }), method: "PATCH" }, "Couldn't change the link.", jsonRes);

export const syncMaster = (id: number) =>
  call<{ changes: SyncChange[] }>(`${base(id)}/doc/sync-master`, { method: "POST" }, "Couldn't compare with the master.", jsonRes);

export const applySyncMaster = (id: number, ids: string[]) =>
  call<ResumeDocDTO>(`${base(id)}/doc/sync-master/apply`, json({ ids }), "Couldn't apply those changes.", async (r) => {
    const dto = await jsonRes<ResumeDocDTO>(r);
    return { ...dto, docVersion: parseEtag(r.headers.get("etag")) ?? dto.docVersion };
  });

/** What a version is called in the menu: its name, else what wrote it. */
const REASON_LABEL: Record<string, string> = {
  AUTOSAVE: "Auto-save",
  MANUAL: "Saved",
  NAMED: "Saved",
  TEMPLATE_SWITCH: "Template switch",
  AI_APPLY: "AI suggestion",
  IMPORT: "Created",
  RESTORE: "Restored",
  DETACH: "Made a master",
  TAILOR_COPY: "Tailored copy",
};
export const versionLabel = (v: Pick<ResumeVersion, "name" | "reason">): string => v.name?.trim() || REASON_LABEL[v.reason] || "Version";
