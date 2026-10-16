/**
 * The org admin's Resume Builder policy (Settings page, `/w/admin/settings`): `GET|PUT /api/orgs/{orgId}/resume-policy`. Today one switch,
 * whether consultants of the organization may create share links for their organization resumes (default off; a marketer acting for a
 * consultant can never, whatever it says). The API owns every rule; this file is the wire types, a tolerant parser and the two calls.
 */
export interface ResumePolicy {
  /** The value in force: the organization's own choice, else the platform value, else off. */
  consultantShareLinks: boolean;
  /** True when the organization has set it itself. */
  overridden: boolean;
  /** Live share links and named-person grants on the organization's resumes: what switching sharing off pauses at once (and on restores). */
  activeConsultantLinks: number;
}

export type PolicyResult = { kind: "OK"; policy: ResumePolicy } | { kind: "DENIED" } | { kind: "INVALID"; message: string } | { kind: "FAILED" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parsePolicy(json: unknown): ResumePolicy | null {
  if (!isObj(json) || typeof json.consultantShareLinks !== "boolean") return null;
  const n = typeof json.activeConsultantLinks === "number" && Number.isFinite(json.activeConsultantLinks) ? Math.max(0, Math.floor(json.activeConsultantLinks)) : 0;
  return { consultantShareLinks: json.consultantShareLinks, overridden: json.overridden === true, activeConsultantLinks: n };
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/resume-policy`;

export async function fetchResumePolicy(orgId: number | string, signal?: AbortSignal): Promise<PolicyResult> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const policy = parsePolicy(await res.json().catch(() => null));
    return policy ? { kind: "OK", policy } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export async function saveConsultantShareLinks(orgId: number | string, value: boolean): Promise<PolicyResult> {
  try {
    const res = await fetch(base(orgId), {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ consultantShareLinks: value }),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 422 || res.status === 400) {
      const o = isObj(json) ? json : {};
      return { kind: "INVALID", message: typeof o.error === "string" ? o.error : "That value was not accepted." };
    }
    if (!res.ok) return { kind: "FAILED" };
    const policy = parsePolicy(json);
    return policy ? { kind: "OK", policy } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
