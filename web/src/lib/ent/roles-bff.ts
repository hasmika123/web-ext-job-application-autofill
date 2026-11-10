import { badBody, forward, readObject, onlyFields } from "@/lib/admin-proxy";

/**
 * The BFF half of the Roles & Permissions page (X4.11): every `app/api/orgs/[orgId]/roles/**` handler validates the SHAPE of the
 * path (numeric ids) and of the body (known fields only) and forwards to the API, which owns every rule (permission, ceiling,
 * system roles, last admin, If-Match). Tenant host headers are added by `serverApiFetch`, like every other BFF call.
 */
export const ORG_RX = /^\d{1,18}$/;
export const ID_RX = /^\d{1,18}$/;

export const rolesPath = (orgId: string): string | null => (ORG_RX.test(orgId) ? `/api/orgs/${orgId}/roles` : null);
export const orgBase = (orgId: string): string | null => (ORG_RX.test(orgId) ? `/api/orgs/${orgId}` : null);
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** The `If-Match` of the request as forward headers (the API answers 428 without it where it is required). */
export function ifMatchHeaders(request: Request): Record<string, string> {
  const v = request.headers.get("if-match");
  return v ? { "If-Match": v } : {};
}

/** A clamped `?limit=` for the history routes (the API clamps again). */
export function limitParam(request: Request): string {
  const raw = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  const n = Number.isFinite(raw) ? Math.max(1, Math.min(200, Math.trunc(raw))) : 50;
  return `?limit=${n}`;
}

export const CREATE_FIELDS = ["name", "description", "templateKey", "sourceRoleId", "permissions"] as const;
export const UPDATE_FIELDS = ["name", "description", "permissions"] as const;
export const MEMBER_ROLE_FIELDS = ["roleIds", "primaryRoleId"] as const;

export { badBody, forward, readObject, onlyFields };
