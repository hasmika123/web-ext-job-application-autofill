/**
 * Organization Settings, "Prepare selected openings" (decision 2026-10-18: the Org Admin controls it): `GET` and `PUT /api/orgs/{orgId}/org-settings/prepare`.
 * The API owns every rule (permission, bounds against the platform maximum, audit); this file is the wire types, a tolerant parser and the two calls.
 */
export interface PrepareLimit {
  /** The number that applies to this organization now. */
  value: number;
  /** The most Kiwiply allows; the organization can set anything from `min` to this. */
  platformMax: number;
  min: number;
  /** True when the organization holds its own number; false = it follows the platform maximum. */
  custom: boolean;
}

export interface PrepareSettings {
  /** Kiwiply's master switch. Off = the section is shown disabled. */
  platformEnabled: boolean;
  /** This organization's own opt-in (off until the Org Admin turns it on). */
  enabled: boolean;
  dailyCap: PrepareLimit;
  monthlyCap: PrepareLimit;
  maxBatch: PrepareLimit;
  /** How many active consultants hold the add-on on a live license, of how many. */
  licensed: { consultants: number; total: number; featureName: string };
}

export type PrepareField = "dailyCap" | "monthlyCap" | "maxBatch";

export type PrepareResult =
  | { kind: "OK"; settings: PrepareSettings }
  | { kind: "DEMO" }
  | { kind: "DENIED" }
  | { kind: "PLATFORM_OFF" }
  | { kind: "INVALID"; message: string; field?: string }
  | { kind: "FAILED" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseLimit(v: unknown): PrepareLimit | null {
  if (!isObj(v)) return null;
  const value = num(v.value);
  const platformMax = num(v.platformMax);
  const min = num(v.min);
  if (value === null || platformMax === null || min === null) return null;
  return { value, platformMax, min, custom: v.custom === true };
}

export function parsePrepareSettings(json: unknown): PrepareSettings | null {
  if (!isObj(json) || typeof json.platformEnabled !== "boolean" || typeof json.enabled !== "boolean") return null;
  const dailyCap = parseLimit(json.dailyCap);
  const monthlyCap = parseLimit(json.monthlyCap);
  const maxBatch = parseLimit(json.maxBatch);
  if (!dailyCap || !monthlyCap || !maxBatch) return null;
  const l = isObj(json.licensed) ? json.licensed : {};
  return {
    platformEnabled: json.platformEnabled,
    enabled: json.enabled,
    dailyCap,
    monthlyCap,
    maxBatch,
    licensed: { consultants: num(l.consultants) ?? 0, total: num(l.total) ?? 0, featureName: typeof l.featureName === "string" && l.featureName ? l.featureName : "Autopilot prepare" },
  };
}

const url = (orgId: number | string) => `/api/orgs/${orgId}/org-settings/prepare`;

export async function fetchPrepareSettings(orgId: number | string, signal?: AbortSignal): Promise<PrepareResult> {
  try {
    const res = await fetch(url(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const settings = parsePrepareSettings(await res.json().catch(() => null));
    return settings ? { kind: "OK", settings } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** Only the fields present are sent. A `null` number puts that limit back to following the platform maximum. */
export interface PrepareChange {
  enabled?: boolean;
  dailyCap?: number | null;
  monthlyCap?: number | null;
  maxBatch?: number | null;
}

export async function savePrepareSettings(orgId: number | string, body: PrepareChange): Promise<PrepareResult> {
  try {
    const res = await fetch(url(orgId), {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    const o = isObj(json) ? json : {};
    if (res.status === 403 && o.code === "DEMO_READ_ONLY") return { kind: "DEMO" };
    if (res.status === 409 && o.code === "PREPARE_PLATFORM_OFF") return { kind: "PLATFORM_OFF" };
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (res.status === 422 || res.status === 400) {
      return { kind: "INVALID", message: typeof o.error === "string" ? o.error : "That value was not accepted.", field: typeof o.field === "string" ? o.field : undefined };
    }
    if (!res.ok) return { kind: "FAILED" };
    const settings = parsePrepareSettings(json);
    return settings ? { kind: "OK", settings } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** The wording of the section, kept in one place (and tested): the consultant always reviews and submits; Kiwiply never submits. */
export const PREPARE_EXPLAINER =
  "When a consultant selects assigned openings, the browser extension opens each job in its own tab and fills it from the consultant's profile. The consultant always reviews, completes anything missing and presses Submit on the real site. Nothing is ever submitted for them.";
export const PREPARE_UNAVAILABLE = "Not available on your plan yet. Contact support.";
