import { forward } from "../../respond";

/** GET /api/admin/ai/config/history?key&limit: the newest changes to AI settings. */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams;
  const q = new URLSearchParams();
  const key = src.get("key");
  const limit = src.get("limit");
  if (key && /^[a-z0-9_:./-]{1,160}$/i.test(key)) q.set("key", key);
  if (limit && /^\d+$/.test(limit)) q.set("limit", limit);
  const qs = q.toString();
  return forward(`/api/admin/ai/config/history${qs ? `?${qs}` : ""}`);
}
