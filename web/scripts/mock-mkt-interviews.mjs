/**
 * Dev mock for `GET /api/orgs/{orgId}/mkt/interviews` (Marketing workspace). Replace the body of `handle` with the board's rows;
 * keep the exported name. Return true when the request was answered. See mock-mkt-home.mjs for the shape of a mock.
 */
export function createMktInterviewsMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    void [json, subOf, req, res, path, method];
    return false;
  };
}
