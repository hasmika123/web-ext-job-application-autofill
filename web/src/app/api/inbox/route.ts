import { serverApiFetch } from "@/lib/api";

/**
 * Connect or disconnect the user's dedicated Gmail (Phase 14.1). Proxies Spring's
 * `/api/profile/inbox`. The app password passes through to the API — which checks it against Gmail
 * and stores it only encrypted — and is never logged, stored or echoed here.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { address?: unknown; appPassword?: unknown } | null;
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const appPassword = typeof body?.appPassword === "string" ? body.appPassword : "";
  if (!address || !appPassword) {
    return Response.json({ code: "MISSING", message: "Enter the Gmail address and its app password." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await serverApiFetch("/api/profile/inbox", { method: "POST", body: JSON.stringify({ address, appPassword }) });
  } catch {
    return Response.json({ code: "UNREACHABLE", message: "Couldn't reach the server. Please try again." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ code: "SESSION", message: "Your session expired — please sign in again." }, { status: 401 });
  if (res.status === 402) return Response.json({ code: "PRO_REQUIRED", message: "Connecting an inbox is part of Pro." }, { status: 402 });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.message === "string" ? data.message : "Connecting didn't work. Please try again.";
    const code = typeof data.code === "string" ? data.code : "FAILED";
    return Response.json({ code, message }, { status: res.status });
  }
  return Response.json(data);
}

export async function DELETE() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/profile/inbox", { method: "DELETE" });
  } catch {
    return Response.json({ message: "Couldn't reach the server. Please try again." }, { status: 502 });
  }
  if (!res.ok) return Response.json({ message: "Disconnecting didn't work. Please try again." }, { status: 502 });
  return Response.json({ ok: true });
}
