import { describe, expect, it } from "vitest";
import { handoffFrom } from "./extension-handoff";

const base = { accessToken: "a.b.c", refreshToken: "d.e.f" };

describe("handoffFrom (decision O4)", () => {
  it("a personal session carries kind, user id, email and the legacy username next to access / refresh", () => {
    expect(handoffFrom({ ...base, kind: "PERSONAL", userId: 7, email: "sam@x.test", username: "sam" })).toEqual({
      access: "a.b.c", refresh: "d.e.f", kind: "PERSONAL", userId: 7, email: "sam@x.test", username: "sam",
    });
  });

  it("an older server (no kind) is a personal handoff, and the account lookup username is the fallback", () => {
    const t = handoffFrom(base, "fallback-login");
    expect(t).toMatchObject({ kind: "PERSONAL", username: "fallback-login" });
    expect(t?.userId).toBeUndefined();
  });

  it("an enterprise session carries org id and name, and never a username or the ent# login", () => {
    const t = handoffFrom({ ...base, kind: "ENTERPRISE", userId: 41, orgId: 3, orgName: "Acme Staffing", email: "sam@x.test", username: "ent#3#sam@x.test" }, "ent#3#sam@x.test");
    expect(t).toEqual({ access: "a.b.c", refresh: "d.e.f", kind: "ENTERPRISE", userId: 41, email: "sam@x.test", orgId: 3, orgName: "Acme Staffing" });
    expect(JSON.stringify(t)).not.toContain("ent#");
  });

  it("an enterprise session needs a positive integer org id AND user id (the extension refuses anything else)", () => {
    for (const bad of [{ orgId: 0, userId: 1 }, { orgId: -2, userId: 1 }, { orgId: 1.5, userId: 1 }, { orgId: "3", userId: 1 }, { orgId: 3 }, { userId: 1 }, { orgId: 3, userId: 0 }]) {
      expect(handoffFrom({ ...base, kind: "ENTERPRISE", ...bad })).toBeNull();
    }
  });

  it("a response without both tokens is malformed", () => {
    expect(handoffFrom(null)).toBeNull();
    expect(handoffFrom({ accessToken: "x" })).toBeNull();
    expect(handoffFrom({ accessToken: "", refreshToken: "y" })).toBeNull();
  });
});
