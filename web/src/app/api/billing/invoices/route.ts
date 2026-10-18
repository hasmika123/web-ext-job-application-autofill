import { passThrough } from "@/lib/subscription/bff";

/** GET /api/billing/invoices: the signed-in account's last 36 invoices (the API answers 404 to an enterprise account). */
export async function GET() {
  return passThrough("/api/billing/invoices", null, { method: "GET" });
}
