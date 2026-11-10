import { describe, expect, it } from "vitest";
import { demoLogin, demoPeople, ENTERPRISE_DEMO } from "../../../scripts/fixtures/enterprise.mjs";
import { meTenantFor, memberStatus, roleName } from "../../../scripts/mock-me-tenant.mjs";

/** The mock's enterprise demo (X1.12): the same roster the API seeds, answering like the real contract. */
describe("mock enterprise demo roster", () => {
  it("has Acme's eleven and Beta's one, with distinct logins in the API's namespace", () => {
    expect(demoPeople("acme.localhost")).toHaveLength(11);
    expect(demoPeople("beta.localhost")).toHaveLength(1);
    expect(demoPeople("nobody.localhost")).toEqual([]);
    const logins = Object.keys(ENTERPRISE_DEMO).flatMap((h: string) => demoPeople(h) as { login: string | null }[]).map((p) => p.login).filter(Boolean);
    expect(new Set(logins).size).toBe(logins.length);
    for (const l of logins) expect(l).toMatch(/^demo-ent-(acme|beta)-[a-z]+$/);
    expect(demoLogin("acme", "sarah")).toBe("demo-ent-acme-sarah");
  });

  it("has one suspended and one invited member (the invitation has no login)", () => {
    const acme = demoPeople("acme.localhost");
    expect(acme.filter((p: { status: string }) => p.status === "SUSPENDED")).toHaveLength(1);
    const invited = acme.filter((p: { status: string }) => p.status === "INVITED");
    expect(invited).toHaveLength(1);
    expect(invited[0].login).toBeNull();
  });

  it("Sarah holds two roles and the contract names them; her roles are the board's Org Admin + Marketing Manager", () => {
    const me = meTenantFor("acme.localhost", "demo-ent-acme-sarah");
    expect(me?.body.person.name).toBe("Sarah Chen");
    expect(me?.body.roles.map((r: { key: string }) => r.key)).toEqual(["ORG_ADMIN", "MARKETING_MANAGER"]);
    expect(roleName("MARKETING_MANAGER")).toBe("Marketing Manager");
    expect(me?.body.workspaces.length).toBeGreaterThanOrEqual(2);
  });

  it("every roster role is a mock role, and every member is on their own host only", () => {
    for (const host of Object.keys(ENTERPRISE_DEMO)) {
      for (const p of demoPeople(host)) {
        if (!p.login) continue;
        expect(memberStatus(host, p.login)).toBe(p.status);
        const other = host === "acme.localhost" ? "beta.localhost" : "acme.localhost";
        expect(memberStatus(other, p.login)).toBeNull();
        expect(meTenantFor(host, p.login)).not.toBeNull();
      }
    }
  });

  it("Beta's owner is a different organization with no Acme data", () => {
    const me = meTenantFor("beta.localhost", "demo-ent-beta-bea");
    expect(me?.body.org.displayName).toBe("Beta Talent");
    expect(me?.body.roles.map((r: { key: string }) => r.key)).toEqual(["OWNER"]);
    expect(meTenantFor("acme.localhost", "demo-ent-beta-bea")).toBeNull();
  });
});
