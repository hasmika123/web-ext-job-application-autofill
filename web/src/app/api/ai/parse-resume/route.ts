import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

/**
 * POST /api/ai/parse-resume — thin authenticated proxy to the Spring endpoint (the
 * browser never calls Spring directly; the JWT stays in httpOnly cookies). Body is
 * passed through: { text?, fileBase64?, fileMimeType?, consent } → Spring validates
 * and meters (one parse = one AI credit).
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024; // base64 PDF cap (~5MB file) + text headroom

export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "You're not signed in." }, { status: 401 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "That file is too large (max ~5MB)." }, { status: 413 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/ai/parse-resume"), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: raw,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }

  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
