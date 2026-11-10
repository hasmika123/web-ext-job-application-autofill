import { serverApiFetch } from "@/lib/api";
import { badBody, forward, onlyFields, passthrough, readObject } from "@/lib/admin-proxy";

/**
 * GET /api/admin/orgs?q&status&type&enterprise&page&size - the Organizations list in the shared list contract
 * (`{ items, total, page, size }`), over Spring's `GET /api/admin/orgs` (`search`, `status`, `type`, `enterprise`, paging headers).
 * POST /api/admin/orgs - Create organization (the owner's account is created in the same call; the temporary password is in
 * THIS response only). Spring enforces ROLE_ADMIN and audits.
 */
const PASSES = ["status", "type", "enterprise"] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(0, Number.parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
  const size = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("size") ?? "20", 10) || 20));
  const qs = new URLSearchParams({ page: String(page), size: String(size) });
  const q = url.searchParams.get("q")?.trim();
  if (q) qs.set("search", q);
  for (const k of PASSES) {
    const v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/orgs?${qs}`);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) return passthrough(res);
  const items = (await res.json().catch(() => [])) as unknown[];
  const total = Number.parseInt(res.headers.get("x-total-count") ?? String(items.length), 10) || 0;
  return Response.json({ items, total, page, size });
}

export async function POST(request: Request) {
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["name", "label", "type", "ownerEmail", "ownerName"]);
  if (bad) return badBody(bad);
  const res = await forward("/api/admin/orgs", { method: "POST", body: JSON.stringify(body) });
  res.headers.set("cache-control", "no-store"); // the answer carries a one-time password
  return res;
}
