import { cookies } from "next/headers";
import { getMyOrgs } from "@/lib/org";
import { ORG_COOKIE, ORG_COOKIE_MAX_AGE } from "@/lib/cookies";
import { seesConsole } from "@/lib/org-types";

/**
 * POST /api/orgs/current {orgId} - remember which organization the console shows (the switcher, O1.7). Sets the
 * httpOnly `kiwiply_org` cookie, but only to an org the caller administers: the id is checked against
 * `GET /api/orgs/mine` here, so the cookie can never name somebody else's org (and the layout re-checks on every request).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { orgId?: unknown } | null;
  const orgId = typeof body?.orgId === "number" || typeof body?.orgId === "string" ? String(body.orgId) : "";
  if (!/^\d+$/.test(orgId)) return Response.json({ error: "Pick one of your organizations." }, { status: 400 });

  const mine = await getMyOrgs();
  if (!mine.ok) return Response.json({ error: "Couldn't reach the server." }, { status: mine.status === 401 ? 401 : 502 });
  const hit = mine.orgs.find((o) => String(o.orgId) === orgId && seesConsole(o.role));
  if (!hit) return Response.json({ error: "Not found" }, { status: 404 });

  (await cookies()).set(ORG_COOKIE, String(hit.orgId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ORG_COOKIE_MAX_AGE,
  });
  return Response.json({ ok: true, orgId: hit.orgId });
}
