import { describe, expect, it } from "vitest";
import { meTenantFor as untypedMeTenantFor } from "../../../scripts/mock-me-tenant.mjs";

type MockAnswer = { body: unknown; etag: string; suspended: boolean } | null;
const meTenantFor = untypedMeTenantFor as (host: string, login: string) => MockAnswer;
import { parseMeTenant } from "@/lib/ent/tenant-session";
import { landingFor, workspacesFor } from "@/lib/ent/workspaces";

const me = (host: string, login: string) => {
  const a = meTenantFor(host, login);
  return a ? parseMeTenant(a.body) : null;
};

describe("the mock /api/me/tenant honours the contract", () => {
  it("every mock member's answer parses as the contract", () => {
    for (const login of ["owner@acme.com", "marketer@acme.com", "sarah@acme.com", "consultant@acme.com", "finance@acme.com"]) {
      expect(me("acme.localhost", login), login).not.toBeNull();
    }
    expect(me("beta.localhost", "owner@beta.com")).not.toBeNull();
  });

  it("owners land in administration; Sarah has two workspaces and lands in the first", () => {
    expect(landingFor(me("acme.localhost", "owner@acme.com")!)).toBe("/w/admin");
    const sarah = me("acme.localhost", "sarah@acme.com")!;
    expect(workspacesFor(sarah).map((w) => w.key)).toEqual(["admin", "marketing-mgmt"]);
    expect(landingFor(sarah)).toBe("/w/admin");
  });

  it("filters pages by the member's permissions and the organization's modules", () => {
    const marketer = me("acme.localhost", "marketer@acme.com")!;
    expect(workspacesFor(marketer).map((w) => w.key)).toEqual(["marketing"]);
    expect(marketer.workspaces[0].nav.map((n) => n.key)).not.toContain("approvals");
    const consultant = me("acme.localhost", "consultant@acme.com")!;
    expect(consultant.workspaces[0].nav.map((n) => n.key)).toContain("offers");
    expect(consultant.workspaces[0].nav.map((n) => n.key)).not.toContain("billing");
    // Beta has no modules: its owner sees only the module-free admin pages
    const beta = me("beta.localhost", "owner@beta.com")!;
    expect(beta.workspaces[0].nav.map((n) => n.key)).not.toContain("billing");
    expect(beta.workspaces[0].nav.map((n) => n.key)).toContain("settings");
  });

  it("is isolated per tenant and flags a suspended member", () => {
    expect(meTenantFor("beta.localhost", "owner@acme.com")).toBeNull();
    expect(meTenantFor("acme.localhost", "owner@beta.com")).toBeNull();
    expect(meTenantFor("acme.localhost", "paused@acme.com")?.suspended).toBe(true);
    expect(meTenantFor("acme.localhost", "owner@acme.com")?.etag).not.toBe(meTenantFor("acme.localhost", "sarah@acme.com")?.etag);
  });
});
