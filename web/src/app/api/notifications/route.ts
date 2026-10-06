import { serverApiFetch } from "@/lib/api";

/** GET /api/notifications — the latest in-app notifications and the unread count (Phase 14.6). */
export async function GET() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/profile/notifications");
  } catch {
    return Response.json({ unread: 0, items: [] }, { status: 502 });
  }
  if (!res.ok) return Response.json({ unread: 0, items: [] }, { status: res.status === 401 ? 401 : 502 });
  return Response.json(await res.json().catch(() => ({ unread: 0, items: [] })));
}
