import { forward } from "@/lib/admin-proxy";
import { pickQuery } from "@/lib/admin-plans-bff";

/** GET ?audience&category&active&q - the services (feature definitions) the add-service sheet searches. */
export async function GET(request: Request) {
  return forward(`/api/admin/catalog/services${pickQuery(request, ["audience", "category", "active", "q"])}`);
}
