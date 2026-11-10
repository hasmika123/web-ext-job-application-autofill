import { apiUrl } from "@/lib/config";

/** GET /api/catalog/public: the published, public plans (no account needed). Cached for a minute at the edge; the page also keeps its last good copy. */
export async function GET() {
  try {
    const res = await fetch(apiUrl("/api/catalog/public"), { next: { revalidate: 60 } });
    const text = await res.text();
    return new Response(text || "{}", {
      status: res.status,
      headers: { "content-type": "application/json", ...(res.ok ? { "cache-control": "public, max-age=60" } : {}) },
    });
  } catch {
    return Response.json({ code: "UNREACHABLE", error: "Couldn't reach the server." }, { status: 502 });
  }
}
