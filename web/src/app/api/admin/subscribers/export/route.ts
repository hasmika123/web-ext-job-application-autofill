import { serverApiFetch } from "@/lib/api";

/**
 * GET /api/admin/subscribers/export — proxy the Spring CSV export with the admin bearer and
 * return it as a file download (the browser can't attach the httpOnly token itself).
 */
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";

  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/subscribers/export${qs}`);
  } catch {
    return new Response("Couldn't reach the server.", { status: 502 });
  }
  if (!res.ok) {
    return new Response("Export failed.", { status: res.status });
  }
  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="subscribers.csv"',
    },
  });
}
