import { forward } from "@/lib/admin-proxy";
import { pickQuery } from "@/lib/admin-plans-bff";

/** GET - the margin guard's answer for one price (the live tick next to a price box): worst case, floor, headroom, levers. */
export async function GET(request: Request) {
  return forward(`/api/admin/catalog/margin${pickQuery(request, ["kind", "audience", "interval", "amountMinor", "aiBudgetCents", "quantity", "payoutMinor", "discountBp", "currency"])}`);
}
