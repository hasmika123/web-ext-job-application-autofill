import { describe, expect, it } from "vitest";
import { DEFAULT_QUERY, bulkSummary, displayName, hasFilter, isEmail, listParams, parseEntries, problemText, relativeTime, rowProblem } from "./invitations";
import { idsBody, inviteBody, listQuery, orgPath } from "./invitations-bff";

const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("the list query", () => {
  it("sends only what is set; the page is 0-based for the API", () => {
    expect(listParams(DEFAULT_QUERY, NOW).toString()).toBe("page=0&size=10");
    const p = listParams({ ...DEFAULT_QUERY, status: "PENDING", roleId: "13", departmentGroupId: "21", range: "30", q: "  ana ", page: 3 }, NOW);
    expect(p.get("status")).toBe("PENDING");
    expect(p.get("roleId")).toBe("13");
    expect(p.get("departmentGroupId")).toBe("21");
    expect(p.get("q")).toBe("ana");
    expect(p.get("page")).toBe("2");
    expect(p.get("from")).toBe("2026-09-13T12:00:00.000Z"); // 30 days back, an ISO instant the API parses
    expect(hasFilter({ ...DEFAULT_QUERY, q: " " })).toBe(false);
    expect(hasFilter({ ...DEFAULT_QUERY, range: "7" })).toBe(true);
  });
});

describe("pasted lists", () => {
  it("splits on lines, commas and semicolons, keeps 'Name <email>' whole and drops repeats", () => {
    expect(parseEntries("a@x.co, B Person <b@x.co>\nA@x.co; c@x.co\n\n")).toEqual(["a@x.co", "B Person <b@x.co>", "c@x.co"]);
  });
  it("checks addresses", () => {
    expect(isEmail("name@company.com")).toBe(true);
    expect(isEmail("name@company")).toBe(false);
    expect(isEmail("na me@company.com")).toBe(false);
  });
});

describe("words", () => {
  it("relative times", () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    expect(relativeTime(at(10_000), NOW)).toBe("just now");
    expect(relativeTime(at(5 * 60_000), NOW)).toBe("5 minutes ago");
    expect(relativeTime(at(2 * 3600_000), NOW)).toBe("2 hours ago");
    expect(relativeTime(at(3600_000), NOW)).toBe("1 hour ago");
    expect(relativeTime(at(3 * 86_400_000), NOW)).toBe("3 days ago");
    expect(relativeTime(at(60 * 86_400_000), NOW)).toMatch(/2026/);
    expect(relativeTime("garbage", NOW)).toBe("");
  });
  it("names a person by name, else by the address before the @", () => {
    expect(displayName({ name: " Emily Carter ", email: "e@x.co" })).toBe("Emily Carter");
    expect(displayName({ name: null, email: "emily.c@x.co" })).toBe("emily.c");
  });
  it("explains each refusal", () => {
    expect(rowProblem({ status: "INVITED", reason: null, email: "a@x.co", entry: "a@x.co" })).toBeNull();
    expect(rowProblem({ status: "INVALID", reason: "malformed", email: null, entry: "x" })).toMatch(/email address/);
    expect(rowProblem({ status: "ALREADY_MEMBER", reason: null, email: "a@x.co", entry: "a@x.co" })).toMatch(/already a member/i);
    expect(rowProblem({ status: "DUPLICATE", reason: "duplicate", email: "a@x.co", entry: "a@x.co" })).toMatch(/more than once/);
    expect(problemText({ status: 422, code: "ROLE_CEILING", message: "x" })).toMatch(/more access than you hold/);
    expect(problemText({ status: 404, message: "x" })).toMatch(/isn't available/);
  });
  it("sums up a bulk action", () => {
    expect(bulkSummary([{ id: 1, status: "OK", code: null }], "resent")).toBe("1 invitation resent.");
    expect(bulkSummary([{ id: 1, status: "OK", code: null }, { id: 2, status: "FAILED", code: "X" }, { id: 3, status: "OK", code: null }], "revoked")).toBe("2 invitations revoked. 1 couldn't be revoked.");
  });
});

describe("the BFF shape checks", () => {
  it("only numeric organization ids reach the API", () => {
    expect(orgPath("2")).toBe("/api/orgs/2/invitations");
    expect(orgPath("2/../x")).toBeNull();
    expect(orgPath("abc")).toBeNull();
  });
  it("forwards only the list keys it knows, capped in length", () => {
    expect(listQuery("http://x/api?status=PENDING&q=ana&evil=1&page=2")).toBe("?status=PENDING&q=ana&page=2");
    expect(listQuery("http://x/api")).toBe("");
    expect(listQuery(`http://x/api?q=${"a".repeat(201)}`)).toBe("");
  });
  const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
  it("an invite body must be a list of text and may not carry other fields", async () => {
    expect(await inviteBody(req({ emails: ["a@x.co"], roleIds: [1] }))).toEqual({ emails: ["a@x.co"], roleIds: [1] });
    expect(((await inviteBody(req({ emails: "a@x.co" }))) as Response).status).toBe(400);
    expect(((await inviteBody(req({ emails: ["a@x.co"], role: "OWNER" }))) as Response).status).toBe(400);
  });
  it("a bulk body is 1 to 100 whole ids", async () => {
    expect(await idsBody(req({ ids: [1, 2] }))).toEqual({ ids: [1, 2] });
    expect(((await idsBody(req({ ids: [] }))) as Response).status).toBe(400);
    expect(((await idsBody(req({ ids: Array.from({ length: 101 }, (_, i) => i + 1) }))) as Response).status).toBe(400);
    expect(((await idsBody(req({ ids: [1.5] }))) as Response).status).toBe(400);
  });
});
