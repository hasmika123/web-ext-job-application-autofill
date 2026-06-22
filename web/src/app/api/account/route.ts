import { serverApiFetch } from "@/lib/api";
import { clearAuthCookies } from "@/lib/auth";

/**
 * DELETE /api/account — proxy the GDPR/CCPA account deletion to Spring, then clear the
 * session cookies (the account no longer exists server-side, so the tokens are dead).
 * The browser never holds the JWT, so erasure is driven entirely server-side here.
 */
export async function DELETE() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/account", { method: "DELETE" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't delete your account. Please try again." }, { status: 502 });
  }

  await clearAuthCookies();
  return Response.json({ ok: true });
}
