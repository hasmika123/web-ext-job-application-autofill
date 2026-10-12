/**
 * Browser-side calls to the org BFF (`/api/orgs/...`): one place that turns a response into `{ok, data}` or `{ok:false,
 * problem}`, so a screen branches on the API's problem `code` (`SLUG_TAKEN`, `ORG_INVALID`, `ORG_LIMIT_REACHED`,
 * `SENSITIVE_CONTENT`, `DEMO_READ_ONLY`, `NOT_FOUND`) and never on text. A dropped connection is `status: 0, code: "NETWORK"`.
 *
 * The org id a caller passes comes from `useOrg()` (resolved on the server by the layout), never from the URL or storage.
 */

export interface OrgProblem {
  status: number;
  code?: string;
  /** Human text the server sent (`title` for org problems); fine to show for 4xx, never branch on it. */
  message?: string;
  field?: string;
  suggestion?: string;
  max?: number;
  limit?: string;
  path?: string;
}

export type OrgResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; problem: OrgProblem };

export async function orgRequest<T>(path: string, init: RequestInit = {}): Promise<OrgResult<T>> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    return { ok: false, status: 0, problem: { status: 0, code: "NETWORK" } };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    ok: false,
    status: res.status,
    problem: {
      status: res.status,
      code: str(body?.code),
      message: str(body?.title) ?? str(body?.message) ?? str(body?.error),
      field: str(body?.field),
      suggestion: str(body?.suggestion),
      max: typeof body?.max === "number" ? body.max : undefined,
      limit: str(body?.limit),
      path: str(body?.path),
    },
  };
}

/** `/api/orgs/{orgId}{rest}`: the BFF route of the org the layout resolved. */
export const orgPath = (orgId: number, rest = "") => `/api/orgs/${orgId}${rest}`;
