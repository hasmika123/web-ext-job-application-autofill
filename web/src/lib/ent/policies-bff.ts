import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Policies page (docs/enterprise-v2/62): every `app/api/orgs/[orgId]/policies/**` handler validates the SHAPE of the
 * path (numeric org id, a plausible policy kind) and forwards to the API, which owns every rule (permission, tenant wall, which kinds exist,
 * sanitizing, review state, If-Match). Spring's ProblemDetail comes back as `{ error, code, ... }`.
 */
export const orgPath = (orgId: string): string | null => (/^\d{1,18}$/.test(orgId) ? `/api/orgs/${orgId}/policies` : null);

/** A policy kind as it appears in a URL: `PRIVACY`, `acceptable-use`. The API decides whether it is configured. */
export const validKind = (kind: string): boolean => /^[A-Za-z][A-Za-z_-]{1,39}$/.test(kind);

export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export { badBody, forward, readObject };
