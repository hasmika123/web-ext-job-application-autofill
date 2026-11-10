import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * The BFF half of the Job Streams page: path builders + the shape checks the route handlers share. The API owns permission
 * (`matches.run`), the tenant wall, bounds and the sensitive-text scan; here only the SHAPE of ids and bodies is checked.
 */
export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

const ORG = /^\d{1,18}$/;
const KEY = /^[A-Za-z_]{1,30}$/;

export const streamsPath = (orgId: string, rest = ""): string | null => (ORG.test(orgId) ? `/api/orgs/${orgId}/mkt/streams${rest}` : null);
export const streamIdOk = (id: string) => /^\d{1,18}$/.test(id);
export const ruleKeyOk = (key: string) => KEY.test(key);

export const STREAM_FIELDS = ["sourceLabel", "subtitle", "syncEveryMinutes", "keywords", "clientScope"] as const;
export const RULE_FIELDS = ["enabled", "value"] as const;

/** The JSON body of a write, restricted to `allowed`; a Response when it is malformed. */
export async function bodyOf(request: Request, allowed: readonly string[]): Promise<Record<string, unknown> | Response> {
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, allowed);
  return bad ? badBody(bad) : body;
}

export { forward };
