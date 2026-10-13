/**
 * The Marketing workspace API mocks (`/api/orgs/{orgId}/mkt/**`), DEV ONLY. One file per page (`mock-mkt-<page>.mjs`) so pages
 * never edit the same file; mock-api.mjs wires this aggregator once.
 */
import { createMktHomeMock } from "./mock-mkt-home.mjs";
import { createMktTalentMock } from "./mock-mkt-talent.mjs";
import { createMktResumesMock } from "./mock-mkt-resumes.mjs";
import { createMktJobsMock } from "./mock-mkt-jobs.mjs";
import { createMktMatchesMock } from "./mock-mkt-matches.mjs";
import { createMktOpportunitiesMock } from "./mock-mkt-opportunities.mjs";
import { createMktStreamsMock } from "./mock-mkt-streams.mjs";
import { createMktSubmissionsMock } from "./mock-mkt-submissions.mjs";
import { createMktApplicationsMock } from "./mock-mkt-applications.mjs";
import { createMktInterviewsMock } from "./mock-mkt-interviews.mjs";
import { createMktFollowupsMock } from "./mock-mkt-followups.mjs";

export function createMktMock(deps) {
  const handlers = [
    createMktHomeMock(deps),
    createMktTalentMock(deps),
    createMktResumesMock(deps),
    createMktJobsMock(deps),
    createMktMatchesMock(deps),
    createMktOpportunitiesMock(deps),
    createMktStreamsMock(deps),
    createMktSubmissionsMock(deps),
    createMktApplicationsMock(deps),
    createMktInterviewsMock(deps),
    createMktFollowupsMock(deps),
  ];
  return function handle(req, res, path, method) {
    return handlers.some((h) => h(req, res, path, method));
  };
}
