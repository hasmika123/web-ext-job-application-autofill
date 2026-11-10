import { badBody, forward, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Branding page (X2.18): every `app/api/orgs/[orgId]/branding/**` handler validates the SHAPE of the
 * path (numeric org id, known asset kind) and forwards to the API, which owns every rule (permission, tenant wall, colour
 * gate, upload limits, If-Match). Spring's ProblemDetail comes back as `{ error, code, field, suggestion, ... }`.
 */
export const KINDS = ["logo", "favicon", "banner"] as const;

export const orgPath = (orgId: string): string | null => (/^\d{1,18}$/.test(orgId) ? `/api/orgs/${orgId}/branding` : null);

export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

export { badBody, forward, readObject };
