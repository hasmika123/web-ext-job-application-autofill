import { forward } from "@/lib/admin-proxy";

/** GET - the catalog versions (one `catalog_publish` row per plan publish): the History drawer of the plan builder reads them. */
export async function GET() {
  return forward("/api/admin/catalog/versions");
}
