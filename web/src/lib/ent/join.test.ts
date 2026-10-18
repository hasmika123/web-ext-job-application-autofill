import { describe, expect, it } from "vitest";
import { acceptRefusal, newPasswordProblem, parsePreview, JOIN_PASSWORD_MIN } from "./join";

describe("newPasswordProblem", () => {
  it("applies the platform rule (4-100) and the match check", () => {
    expect(newPasswordProblem("a".repeat(JOIN_PASSWORD_MIN - 1), "a".repeat(JOIN_PASSWORD_MIN - 1))).toMatch(/at least 4/);
    expect(newPasswordProblem("x".repeat(101), "x".repeat(101))).toMatch(/at most 100/);
    expect(newPasswordProblem("my-own-1", "my-own-2")).toMatch(/do not match/);
    expect(newPasswordProblem("abcd", "abcd")).toBeNull();
    expect(newPasswordProblem("x".repeat(100), "x".repeat(100))).toBeNull();
  });
});

describe("parsePreview", () => {
  const raw = { source: "EMAIL", orgName: "Acme", orgSlug: "acme", role: "MEMBER", inviterName: "Olivia", open: true, consent: { version: "v3", defaultScope: "SUMMARY", options: ["NONE", "SUMMARY", "FULL"], text: "text" }, roles: ["Consultant"], createsAccount: true };

  it("reads the API shape, keeps only the scopes the join screen offers and carries createsAccount", () => {
    const p = parsePreview(raw)!;
    expect(p.orgName).toBe("Acme");
    expect(p.createsAccount).toBe(true);
    expect(p.consent).toMatchObject({ version: "v3", defaultScope: "SUMMARY", options: ["NONE", "SUMMARY"] });
    expect(p.roles).toEqual(["Consultant"]);
  });

  it("createsAccount is false unless the API says true; garbage is null", () => {
    expect(parsePreview({ ...raw, createsAccount: undefined })!.createsAccount).toBe(false);
    expect(parsePreview({ ...raw, createsAccount: "true" })!.createsAccount).toBe(false);
    expect(parsePreview(null)).toBeNull();
    expect(parsePreview({ orgName: "x" })).toBeNull();
  });
});

describe("acceptRefusal", () => {
  it("maps the API's refusals to calm words and never mentions another account", () => {
    expect(acceptRefusal(409, "ALREADY_MEMBER")).toMatch(/already a member/);
    expect(acceptRefusal(409, "INVITE_EXPIRED")).toMatch(/expired/);
    expect(acceptRefusal(409, "SEAT_STATE")).toMatch(/no longer be used/);
    expect(acceptRefusal(404)).toMatch(/not valid/);
    expect(acceptRefusal(429)).toMatch(/Too many/);
    expect(acceptRefusal(502)).toMatch(/our side/);
    for (const s of [400, 401, 404, 409, 429, 500]) expect(acceptRefusal(s)).not.toMatch(/personal|Kiwiply account|already has an account/i);
  });
});
