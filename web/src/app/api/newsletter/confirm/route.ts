import { apiUrl } from "@/lib/config";

/** POST /api/newsletter/confirm — double-opt-in confirm, proxied to Spring. */
export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ confirmed: false }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) return Response.json({ confirmed: false }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/newsletter/confirm"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ confirmed: false, error: "Couldn't reach the server." }, { status: 502 });
  }
  const data = (await res.json().catch(() => ({}))) as { confirmed?: boolean };
  return Response.json({ confirmed: Boolean(data.confirmed) }, { status: res.ok ? 200 : 400 });
}
