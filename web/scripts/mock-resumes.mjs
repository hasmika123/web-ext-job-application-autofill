/**
 * The Resumes API mock, DEV ONLY: the same routes and shapes as `OrgResumeResource`, but with NO resume data. The talent foundation (consultants,
 * resumes, applications) exists only in the real API, and the mock does not make numbers up, so every read answers honestly with nothing:
 * an empty page, tiles at zero with no history, no filter options and no consultants to add a resume for. A resume id, a write or an export is
 * the generic 404. Use the real stack (docs/enterprise-v2/real-stack-runbook.md) to see the page with data.
 */
const ORG = /^\/api\/orgs\/(\d+)\/resumes(\/.*)?$/;

const tile = () => ({ value: 0, previous: null, delta: null, deltaPercent: null, series: [] });

export function createResumesMock({ json }) {
  return function handleResumes(req, res, path, method) {
    const m = ORG.exec(path);
    if (!m) return false;
    const rest = m[2] ?? "";
    if (method === "GET" && rest === "") return json(res, 200, { items: [], page: 0, size: 10, total: 0, hasNext: false }), true;
    if (method === "GET" && rest === "/counts") return json(res, 200, { asOf: new Date().toISOString(), scope: "ORG", total: tile(), primary: tile(), needsApproval: tile(), updatedThisWeek: tile() }), true;
    if (method === "GET" && rest === "/filters") return json(res, 200, { departments: [], owners: [] }), true;
    if (method === "GET" && rest === "/consultants") return json(res, 200, []), true;
    return json(res, 404, { type: "about:blank", title: "Not found", status: 404, detail: "Not found", code: "NOT_FOUND" }), true;
  };
}
