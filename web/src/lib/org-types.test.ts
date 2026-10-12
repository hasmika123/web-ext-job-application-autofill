import { describe, expect, it } from "vitest";
import { can, canAny, decideOrgGate, seesConsole, type OrgMine } from "./org-types";

const row = (orgId: number, role: OrgMine["role"], status: OrgMine["status"] = "ACTIVE"): OrgMine => ({ orgId, slug: `o${orgId}`, name: `Org ${orgId}`, role, status, memberCount: 1 });

describe("decideOrgGate", () => {
  it("no memberships -> none", () => {
    expect(decideOrgGate([])).toEqual({ kind: "none" });
  });

  it("only MEMBER seats -> member-only", () => {
    expect(decideOrgGate([row(1, "MEMBER"), row(2, "MEMBER")])).toEqual({ kind: "member-only" });
  });

  it("console seats only in closed orgs -> member-only (not the create flow)", () => {
    expect(decideOrgGate([row(1, "OWNER", "CLOSED")])).toEqual({ kind: "member-only" });
  });

  it("every console role renders; MEMBER seats are left out of the list", () => {
    for (const role of ["OWNER", "ADMIN", "STAFF", "MARKETER", "FINANCE"] as const) {
      const d = decideOrgGate([row(5, role), row(6, "MEMBER")]);
      expect(d.kind).toBe("render");
      if (d.kind === "render") expect(d.orgs.map((o) => o.orgId)).toEqual([5]);
    }
  });

  it("the cookie picks among several; a missing, stale or malformed cookie picks the first", () => {
    const all = [row(1, "OWNER"), row(2, "ADMIN"), row(3, "MEMBER")];
    const pick = (cookie?: string | null) => {
      const d = decideOrgGate(all, cookie);
      return d.kind === "render" ? d.current.orgId : null;
    };
    expect(pick("2")).toBe(2);
    expect(pick(undefined)).toBe(1);
    expect(pick("3")).toBe(1); // a MEMBER-only org is not selectable
    expect(pick("99")).toBe(1);
    expect(pick("1 OR 1=1")).toBe(1);
  });
});

describe("permission helpers", () => {
  it("can / canAny read the key list", () => {
    expect(can(["billing.view"], "billing.view")).toBe(true);
    expect(can(["billing.view"], "billing.manage")).toBe(false);
    expect(canAny(["reports.view"], ["billing.view", "reports.view"])).toBe(true);
    expect(canAny([], ["billing.view"])).toBe(false);
  });

  it("MEMBER and the reserved COACH never see the console", () => {
    expect(seesConsole("MEMBER")).toBe(false);
    expect(seesConsole("COACH")).toBe(false);
    expect(seesConsole("FINANCE")).toBe(true);
  });
});
