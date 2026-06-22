import { clearAuthCookies } from "@/lib/auth";

/** POST /api/auth/logout — clear the session cookies. */
export async function POST() {
  await clearAuthCookies();
  return Response.json({ ok: true });
}
