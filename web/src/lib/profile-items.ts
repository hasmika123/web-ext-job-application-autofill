/**
 * The Common Profile's career items as the web sees them (Resume Builder R1.1 API, R1.2 UI):
 * types and the browser-side fetchers (they call the BFF at `/api/profile/items/**`, never Spring).
 * Client-safe: the server readers are in `profile-items-server.ts`. Limits (bytes per item, items per user) are the
 * API's settings and arrive on the builder config; nothing here hard-codes one.
 */
export type ProfileSection =
  | "EXPERIENCE"
  | "EDUCATION"
  | "SKILL"
  | "PROJECT"
  | "CERTIFICATION"
  | "LANGUAGE"
  | "ACHIEVEMENT"
  | "VOLUNTEER"
  | "PUBLICATION"
  | "LINK"
  | "CUSTOM";

export type Provenance = "PARSED" | "USER" | "LEARNED" | "AI";

/** One bullet of an experience / education / project item. */
export interface ItemBullet {
  text: string;
  src?: string;
}

/** The item object of its kind (the resume-document item minus `id` / `hidden`); open on purpose. */
export type ItemData = Record<string, unknown>;

export interface ProfileItem {
  id: number;
  section: ProfileSection;
  position: number;
  data: ItemData;
  provenance: Provenance | null;
  sourceResumeId: number | null;
  hidden: boolean;
  updatedAt: string | null;
}

export interface CompletenessPart {
  weight: number;
  done: boolean;
}

export interface Completeness {
  score: number;
  parts: Record<string, CompletenessPart>;
  nextAction: { key: string; label: string; href: string } | null;
}

/** A refusal from the API, with the machine-readable bits the forms branch on. */
export class ItemApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** `SENSITIVE_CONTENT`: where, and which kind (a SensitivePatterns class code). */
  readonly path: string | null;
  readonly cls: string | null;
  /** `ITEM_LIMIT`: the limit that was hit. */
  readonly limit: number | null;

  constructor(status: number, body: Record<string, unknown> | null, fallback: string) {
    const msg = typeof body?.message === "string" ? body.message : typeof body?.detail === "string" ? body.detail : null;
    super(msg ?? (typeof body?.error === "string" ? body.error : fallback));
    this.status = status;
    this.code = typeof body?.code === "string" ? body.code : null;
    this.path = typeof body?.path === "string" ? body.path : null;
    this.cls = typeof body?.class === "string" ? body.class : null;
    this.limit = typeof body?.limit === "number" ? body.limit : null;
  }
}

async function call<T>(method: string, url: string, body?: unknown, fallback = "Couldn't reach the server."): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ItemApiError(0, null, fallback);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new ItemApiError(res.status, json && typeof json === "object" ? (json as Record<string, unknown>) : null, fallback);
  }
  return json as T;
}

// ---- browser-side fetchers (BFF) ---------------------------------------------------------------

export function createItem(section: ProfileSection, data: ItemData, provenance: Provenance = "USER"): Promise<ProfileItem> {
  return call("POST", "/api/profile/items", { section, dataJson: data, provenance }, "Couldn't add that entry.");
}

export function updateItem(
  id: number,
  patch: { dataJson?: ItemData; hidden?: boolean; position?: number; provenance?: Provenance },
): Promise<ProfileItem> {
  return call("PUT", `/api/profile/items/${id}`, patch, "Couldn't save that entry.");
}

export function deleteItem(id: number): Promise<void> {
  return call("DELETE", `/api/profile/items/${id}`, undefined, "Couldn't delete that entry.");
}

export function fetchCompleteness(): Promise<Completeness> {
  return call("GET", "/api/profile/completeness", undefined, "Couldn't refresh your profile strength.");
}
