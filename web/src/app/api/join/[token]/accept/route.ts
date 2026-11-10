import { setAuthCookies } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { acceptRefusal, isShareScope } from "@/lib/ent/join";

/**
 * POST /api/join/{token}/accept `{ shareScope, consentVersion, password? }` - accept an emailed invitation on an organization's own host (S9,
 * decision O4). For a SEPARATE organization the invite token is the credential: the password chosen here becomes the password of the
 * person's new enterprise account of THIS organization, and the API answers with a session bound to this host; the cookies are written here
 * and the browser only ever sees `{ ok: true }`. For a legacy organization the person's own session is forwarded and no password is sent.
 * The password is only forwarded: never logged, never echoed back, never stored. Nothing here reads or reveals a personal account.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(request, "join-accept", 10, 5 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const { token } = await ctx.params;
  let body: { shareScope?: unknown; consentVersion?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!isShareScope(body.shareScope) || typeof body.consentVersion !== "string" || !body.consentVersion) {
    return Response.json({ error: "Choose what you share with the organization first." }, { status: 400 });
  }
  const payload: Record<string, unknown> = { shareScope: body.shareScope, consentVersion: body.consentVersion };
  if (typeof body.password === "string" && body.password) payload.password = body.password;

  let res: Response;
  try {
    res = await serverApiFetch(`/api/join/${encodeURIComponent(token)}/accept`, { method: "POST", body: JSON.stringify(payload) });
  } catch {
    return Response.json({ error: "Couldn't reach the server. Nothing was changed." }, { status: 502 });
  }
  if (!res.ok) {
    const code = ((await res.json().catch(() => ({}))) as { code?: string }).code;
    return Response.json({ error: acceptRefusal(res.status, code), code }, { status: res.status >= 500 ? 502 : res.status });
  }
  const data = (await res.json().catch(() => ({}))) as { orgName?: string; session?: { accessToken?: string; refreshToken?: string } | null };
  if (data.session?.accessToken) await setAuthCookies(data.session.accessToken, data.session.refreshToken ?? null);
  return Response.json({ ok: true, signedIn: Boolean(data.session?.accessToken), orgName: data.orgName ?? null });
}
