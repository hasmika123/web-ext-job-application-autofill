import { forward } from "@/lib/admin-proxy";

/** GET /api/admin/domains?status&q&page - every organization's addresses (CUSTOM-DOMAINS-BUILD.md A4b). Only those three parameters pass; Spring enforces ROLE_ADMIN. */
const STATUS = /^[A-Z_]{1,12}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = new URLSearchParams();
  const status = url.searchParams.get("status");
  if (status && STATUS.test(status)) qs.set("status", status);
  const q = url.searchParams.get("q")?.trim();
  if (q) qs.set("q", q.slice(0, 100));
  const page = Math.max(0, Number.parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
  qs.set("page", String(page));
  return forward(`/api/admin/domains?${qs}`);
}
