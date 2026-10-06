import { serverApiFetch } from "@/lib/api";

/** POST /api/notifications/read-all — mark every notification read (Phase 14.6). */
export async function POST() {
  try {
    const res = await serverApiFetch("/api/profile/notifications/read-all", { method: "POST" });
    return Response.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }
}
