import { serverApiFetch } from "@/lib/api";

/**
 * GET /api/account/export — proxy the current user's DSAR export and return it as a JSON file
 * download (the browser can't attach the httpOnly bearer itself).
 */
export async function GET() {
  let res: Response;
  try {
    res = await serverApiFetch("/api/account/export");
  } catch {
    return new Response("Couldn't reach the server.", { status: 502 });
  }
  if (res.status === 401) {
    return new Response("Your session expired — please sign in again.", { status: 401 });
  }
  if (!res.ok) {
    return new Response("Export failed.", { status: res.status });
  }
  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="kiwiply-data.json"',
    },
  });
}
