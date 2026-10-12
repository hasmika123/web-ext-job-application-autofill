import { forward, search } from "@/lib/tracker-proxy";

/**
 * GET /api/jobs/search?q&loc&remote&type&posted&company&sort&page&size - search the job postings we keep
 * (`/api/jobs/search`). The query string goes to Spring untouched; Spring validates it and answers
 * `{items, total, page, size, capped, tookMs, facets, suggestions}` or a problem with a `code`
 * (`SORT_INVALID`, `QUERY_TOO_LONG`, `JOB_SEARCH_INVALID`) that is relayed as is.
 */
export async function GET(request: Request) {
  return forward(`/api/jobs/search${search(request)}`);
}
