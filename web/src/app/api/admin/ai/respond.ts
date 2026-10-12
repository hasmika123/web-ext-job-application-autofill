import { serverApiFetch } from "@/lib/api";

/**
 * Shared answer shaping for the admin AI proxies (I1.12; AI-ADMIN-CONFIG-DESIGN 6.4). Spring's ProblemDetail
 * becomes `{ error, code, ...extras }` with the SAME status (the API's `detail` is the human message the page shows
 * inline; `code`, `tasks`, `retryAfterSeconds`, `min`, `max` ... ride along for the page to branch on). Success
 * passes through untouched. The BFF validates shape only, never bounds: bounds are the API's job.
 */
export async function passthrough(res: Response): Promise<Response> {
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const { detail, title, message, ...rest } = data;
    delete rest.type;
    delete rest.instance;
    delete rest.status;
    const error = [detail, title, message].find((v): v is string => typeof v === "string" && v.length > 0) ?? "The action failed.";
    return Response.json({ ...rest, error }, { status: res.status });
  }
  return Response.json(data, { status: res.status });
}

/** Forwards to Spring; a network failure is a 502 in the same `{ error }` shape. */
export async function forward(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await serverApiFetch(path, init);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}

/** The JSON object in a request body, or null when it is missing / not an object. */
export async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export const badBody = (what: string) => Response.json({ error: what }, { status: 400 });

/** Rejects any field outside `allowed` (shape only). Returns the message, or null when fine. */
export function onlyFields(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  const bad = Object.keys(body).find((k) => !allowed.includes(k));
  return bad ? `Unknown field: ${bad}.` : null;
}
