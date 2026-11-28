// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { parseAssignmentsState, parsePipelineState, parseTeamState, writeManagerSearch } from "./state";

describe("Marketing Manager URL state", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/w/marketing-mgmt/team");
  });

  it("restores team filters and pagination from a shareable query", () => {
    expect(parseTeamState({ q: "sarah", status: "PAUSED", sort: "name", page: "2", size: "50" })).toEqual({ q: "sarah", status: "PAUSED", sort: "name", page: 2, size: 50 });
  });

  it("keeps assignment and pipeline filter values typed", () => {
    expect(parseAssignmentsState({ priority: "HIGH", marketerId: "103", noBackup: "true" })).toMatchObject({ priority: "HIGH", marketerId: "103", noBackup: true });
    expect(parsePipelineState({ range: "90", stale: "true", consultant: "22", page: "3" })).toMatchObject({ range: 90, stale: true, consultant: "22", page: 3 });
  });

  it("writes controls without navigating away from the manager page", () => {
    window.history.replaceState({}, "", "/w/marketing-mgmt/pipeline?old=1");
    writeManagerSearch({ range: 90, stale: true, page: 2, old: null });
    expect(window.location.pathname).toBe("/w/marketing-mgmt/pipeline");
    expect(window.location.search).toBe("?range=90&stale=true&page=2");
  });
});
