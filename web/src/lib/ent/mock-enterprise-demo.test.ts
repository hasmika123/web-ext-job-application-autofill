import { describe, expect, it } from "vitest";
import { demoLogin, demoPeople, demoPersonOf, entLogin, ENTERPRISE_DEMO } from "../../../scripts/fixtures/enterprise.mjs";
import { accountOfHandle, meTenantFor, memberStatus, roleName } from "../../../scripts/mock-me-tenant.mjs";

type Person = { key: string; login: string | null; account: string | null; status: string };

/** The mock's enterprise demo (X1.12): the same roster the API seeds, answering like the real contract (SEPARATE accounts, decision O4). */
describe("mock enterprise demo roster", () => {
  it("has Acme's eleven and Beta's one, with distinct one-click handles and enterprise account logins", () => {
    expect(demoPeople("acme.localhost")).toHaveLength(11);
    expect(demoPeople("beta.localhost")).toHaveLength(1);
    expect(demoPeople("nobody.localhost")).toEqual([]);
    const people = Object.keys(ENTERPRISE_DEMO).flatMap((h: string) => demoPeople(h) as Person[]);
    const handles = people.map((p) => p.login).filter(Boolean) as string[];
    expect(new Set(handles).size).toBe(handles.length);
    for (const l of handles) expect(l).toMatch(/^demo-ent-(acme|beta)-[a-z]+$/);
    const accounts = people.map((p) => p.account).filter(Boolean) as string[];
    expect(new Set(accounts).size).toBe(accounts.length);
    for (const a of accounts) expect(a).toMatch(/^ent#(acme|beta)#[a-z]+\.[a-z]+@(acme|beta)\.example\.com$/);
    expect(demoLogin("acme", "sarah")).toBe("demo-ent-acme-sarah");
    expect(entLogin("acme", "sarah")).toBe("ent#acme#sarah.chen@acme.example.com");
    expect(entLogin("acme", "jessica")).toBe("ent#acme#jessica.davis@acme.example.com");
    expect(demoPersonOf(entLogin("acme", "omar"))).toEqual({ orgKey: "acme", key: "omar" });
    expect(demoPersonOf("demo-ent-acme-omar")).toBeNull();
  });

  it("has one suspended and one invited member (the invitation has no handle and no account)", () => {
    const acme = demoPeople("acme.localhost") as Person[];
    expect(acme.filter((p) => p.status === "SUSPENDED")).toHaveLength(1);
    const invited = acme.filter((p) => p.status === "INVITED");
    expect(invited).toHaveLength(1);
    expect(invited[0].login).toBeNull();
    expect(invited[0].account).toBeNull();
  });

  it("Sarah holds two roles and the contract names them; her roles are the board's Org Admin + Marketing Manager", () => {
    const me = meTenantFor("acme.localhost", entLogin("acme", "sarah"));
    expect(me?.body.person.name).toBe("Sarah Chen");
    expect(me?.body.person.email).toBe("sarah.chen@acme.example.com");
    expect(me?.body.person.demo).toBe(true);
    expect(me?.body.roles.map((r: { key: string }) => r.key)).toEqual(["ORG_ADMIN", "MARKETING_MANAGER"]);
    expect(roleName("MARKETING_MANAGER")).toBe("Marketing Manager");
    expect(me?.body.workspaces.length).toBeGreaterThanOrEqual(2);
    expect(meTenantFor("acme.localhost", "owner@acme.com")?.body.person.demo).toBe(false);
  });

  it("every roster member is on their own host only, and the handle opens that host's account only", () => {
    for (const host of Object.keys(ENTERPRISE_DEMO)) {
      for (const p of demoPeople(host) as Person[]) {
        if (!p.account) continue;
        expect(memberStatus(host, p.account)).toBe(p.status);
        expect(accountOfHandle(host, p.login)).toBe(p.account);
        const other = host === "acme.localhost" ? "beta.localhost" : "acme.localhost";
        expect(memberStatus(other, p.account)).toBeNull();
        expect(accountOfHandle(other, p.login)).toBeNull();
        expect(meTenantFor(host, p.account)).not.toBeNull();
      }
    }
  });

  it("Beta's owner is a different organization with no Acme data", () => {
    const bea = entLogin("beta", "bea");
    const me = meTenantFor("beta.localhost", bea);
    expect(me?.body.org.displayName).toBe("Beta Talent");
    expect(me?.body.roles.map((r: { key: string }) => r.key)).toEqual(["OWNER"]);
    expect(meTenantFor("acme.localhost", bea)).toBeNull();
  });
});
