import { serverApiFetch } from "@/lib/api";
import { summarizePlans, type PlanSummary } from "@/lib/admin-plans";
import { badBody, forward, onlyFields, passthrough, readObject } from "@/lib/admin-proxy";

/**
 * GET /api/admin/plans?q&audience&status&interval - the plans list in the shared list contract (`{ items, total, page, size,
 * summary }`) over Spring's `GET /api/admin/plans` (a plain array, filtered by `audience` and `status` there). The search box
 * and the interval filter are applied here (the API has neither; plans are few). `summary` counts ALL plans, not the filtered
 * ones, so the stat tiles do not move when a filter is set (see `summarizePlans`).
 * POST /api/admin/plans - create a plan (HIGH: `reason`); version 1 starts as a DRAFT.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = new URLSearchParams();
  for (const k of ["audience", "status"]) {
    const v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/plans${qs.size ? `?${qs}` : ""}`);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) return passthrough(res);
  const all = (await res.json().catch(() => [])) as PlanSummary[];
  const q = url.searchParams.get("q")?.trim().toLowerCase();
  const interval = url.searchParams.get("interval");
  const items = all.filter(
    (r) => (!q || r.planKey.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) && (!interval || (r.pricesByInterval ?? {})[interval] !== undefined),
  );
  return Response.json({ items, total: items.length, page: 0, size: Math.max(items.length, 1), summary: summarizePlans(all) });
}

export async function POST(request: Request) {
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  const bad = onlyFields(body, ["planKey", "name", "audience", "description", "badge", "publicPlan", "sortOrder", "eligibility", "reason"]);
  if (bad) return badBody(bad);
  return forward("/api/admin/plans", { method: "POST", body: JSON.stringify(body) });
}
