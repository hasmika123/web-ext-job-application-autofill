/**
 * Organization Settings, General and Security (X2.9): `GET /api/orgs/{orgId}/org-settings`, `PUT .../general`, `PUT .../security`. The API owns every
 * rule (permission, bounds, reason, audit); this file is the wire types, a tolerant parser and the calls.
 */
export interface OrgGeneral {
  legalName: string;
  displayName: string;
  timeZone: string;
  locale: string;
  contactEmail: string | null;
}
export interface OrgSecurity {
  /** The organization's own idle-session timeout in minutes, null = the platform behaviour. */
  sessionTimeoutMinutes: number | null;
  /** The organization's own password minimum, null = the platform's. */
  passwordMinLength: number | null;
  bounds: { sessionTimeoutMin: number; sessionTimeoutMax: number; passwordMinFloor: number; passwordMinCeiling: number };
  reasonMinChars: number;
}
export interface OrgSettings {
  general: OrgGeneral;
  security: OrgSecurity;
  locales: string[];
}

export type SettingsResult =
  | { kind: "OK"; settings: OrgSettings }
  | { kind: "DEMO" }
  | { kind: "DENIED" }
  | { kind: "INVALID"; message: string; field?: string }
  | { kind: "FAILED" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function parseSettings(json: unknown): OrgSettings | null {
  if (!isObj(json) || !isObj(json.general) || !isObj(json.security)) return null;
  const g = json.general;
  const s = json.security;
  const b = isObj(s.bounds) ? s.bounds : null;
  const legalName = str(g.legalName);
  const timeZone = str(g.timeZone);
  const locale = str(g.locale);
  const min = b ? num(b.sessionTimeoutMin) : null;
  const max = b ? num(b.sessionTimeoutMax) : null;
  const floor = b ? num(b.passwordMinFloor) : null;
  const ceil = b ? num(b.passwordMinCeiling) : null;
  if (legalName === null || timeZone === null || locale === null || min === null || max === null || floor === null || ceil === null) return null;
  return {
    general: { legalName, displayName: str(g.displayName) ?? legalName, timeZone, locale, contactEmail: str(g.contactEmail) },
    security: {
      sessionTimeoutMinutes: num(s.sessionTimeoutMinutes),
      passwordMinLength: num(s.passwordMinLength),
      bounds: { sessionTimeoutMin: min, sessionTimeoutMax: max, passwordMinFloor: floor, passwordMinCeiling: ceil },
      reasonMinChars: num(s.reasonMinChars) ?? 10,
    },
    locales: Array.isArray(json.locales) ? json.locales.filter((x): x is string => typeof x === "string") : ["en"],
  };
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/org-settings`;

export async function fetchOrgSettings(orgId: number | string, signal?: AbortSignal): Promise<SettingsResult> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const settings = parseSettings(await res.json().catch(() => null));
    return settings ? { kind: "OK", settings } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

async function put(orgId: number | string, section: "general" | "security", body: Record<string, unknown>): Promise<SettingsResult> {
  try {
    const res = await fetch(`${base(orgId)}/${section}`, {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 403 && isObj(json) && json.code === "DEMO_READ_ONLY") return { kind: "DEMO" };
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (res.status === 422 || res.status === 400) {
      const o = isObj(json) ? json : {};
      return { kind: "INVALID", message: typeof o.error === "string" ? o.error : "That value was not accepted.", field: typeof o.field === "string" ? o.field : undefined };
    }
    if (!res.ok) return { kind: "FAILED" };
    const settings = parseSettings(json);
    return settings ? { kind: "OK", settings } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** Only the fields present are sent; an empty text clears (contact e-mail, display name). */
export const saveGeneral = (orgId: number | string, body: Partial<Pick<OrgGeneral, "displayName" | "timeZone" | "locale">> & { contactEmail?: string | null }) => put(orgId, "general", body);

/** `null` puts a value back to the platform behaviour. A reason is required by the API whenever something changes. */
export const saveSecurity = (orgId: number | string, body: { sessionTimeoutMinutes?: number | null; passwordMinLength?: number | null; reason: string }) => put(orgId, "security", body);

/** The audit-log CSV link (the filters of the page, no paging). */
export function auditExportHref(orgId: number | string, q: { action: string; from: string; to: string }): string {
  const p = new URLSearchParams();
  if (q.action) p.set("action", q.action);
  if (q.from) p.set("from", new Date(`${q.from}T00:00:00`).toISOString());
  if (q.to) {
    const d = new Date(`${q.to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    p.set("to", d.toISOString());
  }
  const qs = p.toString();
  return `/api/orgs/${orgId}/audit/export${qs ? `?${qs}` : ""}`;
}
