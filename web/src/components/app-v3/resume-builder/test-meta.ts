/** Test helpers: a complete `ResumeMeta` / `ResumeLineage` / version rows / link grant for the header bar's tests. */
import type { AccessGrant, ResumeLineage, ResumeMeta, ResumeVersion } from "@/lib/resume-meta";

export const NOW = Date.parse("2026-10-12T12:00:00Z");
// config-literal-ok: test fixture clock arithmetic
const HOUR_MS = 3_600_000;
// config-literal-ok: test fixture clock arithmetic
const DAY_MS = 86_400_000;
export const hoursAgo = (h: number) => new Date(NOW - h * HOUR_MS).toISOString();

export function testMeta(overrides: Partial<ResumeMeta> = {}): ResumeMeta {
  return {
    id: 42,
    name: "Senior Software Engineer Resume",
    kind: "BUILT",
    source: { kind: "BUILT", origin: "PROFILE", tailoredFrom: null, madeBy: null, approvalRequired: false, approvedAt: null },
    target: null,
    tags: [],
    primary: false,
    starred: false,
    archived: false,
    lifecycle: "ACTIVE",
    role: "MASTER",
    templateId: "modern",
    createdAt: "2026-10-02T09:00:00Z",
    createdBy: { login: "priya", label: "Priya Sharma" },
    updatedAt: hoursAgo(2),
    updatedBy: { login: "priya", label: "Priya Sharma" },
    lastExportedAt: null,
    score: null,
    pdf: null,
    shareWithOrg: true,
    lineage: { masterId: 42, masterName: "Senior Software Engineer Resume", masterChanged: false, children: 0 },
    visibility: { mode: "PRIVATE", orgPaired: null, orgScope: null, shareWithOrg: true, people: 0 },
    recruiterSharing: { on: false, links: 0, views: 0 },
    version: { current: 3, latest: { name: null, createdAt: hoursAgo(2), kind: "auto" } },
    ...overrides,
  };
}

export function testLineage(overrides: Partial<ResumeLineage> = {}): ResumeLineage {
  return { master: { id: 42, name: "Senior Software Engineer Resume", updatedAt: hoursAgo(2) }, children: [], self: "MASTER", ...overrides };
}

export function testVersions(): ResumeVersion[] {
  const by = { login: "priya", label: "Priya Sharma" };
  return [
    { versionNo: 7, reason: "NAMED", name: "Before tailoring", createdAt: hoursAgo(2), contentHash: "h7", by, kind: "named" },
    { versionNo: 6, reason: "AUTOSAVE", name: null, createdAt: hoursAgo(26), contentHash: "h6", by, kind: "auto" },
    { versionNo: 5, reason: "TEMPLATE_SWITCH", name: null, createdAt: hoursAgo(72), contentHash: "h5", by, kind: "system" },
    { versionNo: 4, reason: "AUTOSAVE", name: null, createdAt: hoursAgo(96), contentHash: "h4", by: { login: "rahul", label: "Rahul" }, kind: "auto" },
  ];
}

export function testLink(overrides: Partial<AccessGrant> = {}): AccessGrant {
  return {
    id: 9,
    subjectType: "LINK",
    role: "VIEW",
    allowDownload: false,
    expired: false,
    createdAt: hoursAgo(1),
    expiresAt: new Date(NOW + 23 * DAY_MS).toISOString(),
    viewCount: 12,
    url: "http://localhost:3000/r/AbCdEfGhIjKlMnOpQrStUvWxYz012345",
    ...overrides,
  };
}
