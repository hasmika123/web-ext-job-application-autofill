import { NextResponse } from "next/server";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";

/**
 * Extension connect handoff. The `/connect` page calls this same-origin (so the httpOnly
 * session cookie is attached); we mint a SEPARATE extension token pair for the signed-in
 * user (its own refresh-rotation family, so it never invalidates the web session) and hand
 * the tokens back. Same-origin + no CORS headers means a cross-site page can't read the
 * response, and the SameSite=lax cookie isn't sent on cross-site fetches — so only a
 * genuinely signed-in kiwiply.com tab can obtain a token.
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
  const data = (await res.json().catch(() => null)) as { accessToken?: string; refreshToken?: string } | null;
  if (!data?.accessToken || !data?.refreshToken) {
    return NextResponse.json({ error: "malformed" }, { status: 502 });
  }

  // Username for the extension's "Connected as …" display (best-effort).
  let username: string | undefined;
  try {
    const acct = await serverApiFetch("/api/account");
    if (acct.ok) {
      const a = (await acct.json().catch(() => null)) as { login?: string; email?: string } | null;
      username = a?.login ?? a?.email ?? undefined;
    }
  } catch {
    /* display-only; ignore */
  }

  return NextResponse.json({ access: data.accessToken, refresh: data.refreshToken, username });
}
