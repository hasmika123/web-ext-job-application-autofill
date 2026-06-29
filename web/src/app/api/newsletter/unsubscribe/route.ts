import { apiUrl } from "@/lib/config";

/** POST /api/newsletter/unsubscribe — one-click unsubscribe (no login), proxied to Spring. */
export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ unsubscribed: false }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) return Response.json({ unsubscribed: false }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/newsletter/unsubscribe"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ unsubscribed: false, error: "Couldn't reach the server." }, { status: 502 });
  }
  const data = (await res.json().catch(() => ({}))) as { unsubscribed?: boolean };
  return Response.json({ unsubscribed: Boolean(data.unsubscribed) }, { status: res.ok ? 200 : 400 });
}
