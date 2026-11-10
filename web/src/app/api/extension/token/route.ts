import { NextResponse } from "next/server";
import { hasSession } from "@/lib/auth";
import { apiUrl } from "@/lib/config";
import { serverApiFetch } from "@/lib/api";
import { handoffFrom } from "@/lib/extension-handoff";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Extension connect handoff. The `/connect` page calls this same-origin (so the httpOnly
 * session cookie is attached); we mint a SEPARATE extension token pair for the signed-in
 * user (its own refresh-rotation family, so it never invalidates the web session) and hand
 * the tokens back. Same-origin + no CORS headers means a cross-site page can't read the
 * response, and the SameSite=lax cookie isn't sent on cross-site fetches — so only a
 * genuinely signed-in kiwiply.com tab can obtain a token.
 *
 * Decision O4: the response also says WHICH account this is (`kind`, `userId`, `email`; an enterprise one adds `orgId`, `orgName`), inside
 * the same object as `access` / `refresh`.
 */
export async function GET() {
  if (!(await hasSession())) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 });
  }

  const res = await serverApiFetch("/api/extension/session", { method: "POST" });
  if (!res.ok) {
    return NextResponse.json(
      { error: "session-failed" },
      { status: res.status === 401 ? 401 : 502 },
    );
  }
  const data = await res.json().catch(() => null);

  // Username for the extension's "Connected as …" display (best-effort; newer servers send it with the session).
  let username: string | undefined;
  if (!(data as { username?: string } | null)?.username) {
    try {
      const acct = await serverApiFetch("/api/account");
      if (acct.ok) {
        const a = (await acct.json().catch(() => null)) as { login?: string; email?: string } | null;
        username = a?.login ?? a?.email ?? undefined;
      }
    } catch {
      /* display-only; ignore */
    }
  }

  const tokens = handoffFrom(data, username);
  if (!tokens) return NextResponse.json({ error: "malformed" }, { status: 502 });
  return NextResponse.json(tokens);
}

/**
 * Enterprise connect (decision O4): the tenant host's "Connect extension" produced a one-time code (60 s, single use) and opened
 * `/connect?code=...` here on the platform host. This turns the code into the extension session of that enterprise account. No cookie is
 * needed (the code is the credential); every failure is the same answer, so it reveals nothing about the code.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, "ext-connect-exchange", 20, 5 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let code: unknown;
  try {
    code = ((await request.json()) as { code?: unknown }).code;
  } catch {
    return NextResponse.json({ error: "invalid-code" }, { status: 400 });
  }
  if (typeof code !== "string" || code.length < 16 || code.length > 200) return NextResponse.json({ error: "invalid-code" }, { status: 400 });

  let res: Response;
  try {
    // A plain fetch, not serverApiFetch: the exchange is public and must not carry a bearer token (an expired one would be a 401 here).
    res = await fetch(apiUrl("/api/extension/connect-code/exchange"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": clientIp(request) },
      body: JSON.stringify({ code }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 502 });
  }
  if (res.status === 429) return tooManyRequests(Number(res.headers.get("retry-after")) || 60);
  if (!res.ok) return NextResponse.json({ error: "invalid-code" }, { status: 400 });
  const tokens = handoffFrom(await res.json().catch(() => null));
  if (!tokens || tokens.kind !== "ENTERPRISE") return NextResponse.json({ error: "malformed" }, { status: 502 });
  return NextResponse.json(tokens);
}
