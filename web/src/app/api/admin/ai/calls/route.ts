import { forward } from "../respond";

/** GET /api/admin/ai/calls?hours&task&provider&failed&limit&before: the ledger window (summary + a page of rows). */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams;
  const q = new URLSearchParams();
  for (const k of ["hours", "limit", "before"]) {
    const v = src.get(k);
    if (v && /^\d+$/.test(v)) q.set(k, v);
  }
  for (const k of ["task", "provider"]) {
    const v = src.get(k);
    if (v && /^[a-z0-9_:.-]{1,64}$/i.test(v)) q.set(k, v);
  }
  if (src.get("failed") === "true") q.set("failed", "true");
  const qs = q.toString();
  return forward(`/api/admin/ai/calls${qs ? `?${qs}` : ""}`);
}
