import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { meTenantFor as untyped } from "../../../scripts/mock-me-tenant.mjs";
import { parseMeTenant } from "@/lib/ent/tenant-session-core";
import { ADMIN_NOT_BUILT, activeKey, bannersFor, catchAllPage, defaultTitle, labelFor, navSections, primaryRoleName, searchPages, shellWorkspace, switcherRows } from "@/lib/ent/shell";
import type { MeTenant } from "@/lib/ent/workspaces";

const meTenantFor = untyped as (host: string, login: string) => { body: unknown } | null;
const me = (host: string, login: string): MeTenant => parseMeTenant(meTenantFor(host, login)!.body)!;
const ws = (m: MeTenant, key: string) => m.workspaces.find((w) => w.key === key)!;
const keys = (m: MeTenant, key: string) => navSections(ws(m, key)).flatMap((s) => s.items.map((i) => i.key));

describe("nav filtering per role (16 s5: the API filtered it, the shell only groups it)", () => {
  it("owner sees the Administration menu in its labelled groups (Dashboard stands alone)", () => {
    const owner = me("acme.localhost", "owner@acme.com");
    const sections = navSections(ws(owner, "admin"));
    expect(sections.map((s) => [s.id, s.label])).toEqual([["main", null], ["people", "People"], ["talent", "Talent"], ["pipeline", "Pipeline"], ["organization", "Organization"]]);
    expect(sections[0].items.map((i) => i.text)).toEqual(["Dashboard"]);
    expect(sections[1].items.map((i) => i.text)).toEqual(["Employees", "Teams & Departments", "Roles"]);
    expect(sections[2].items.map((i) => i.text)).toEqual(["Consultants", "Assignments", "Resumes"]);
    expect(sections[3].items.map((i) => i.text)).toEqual(["Jobs", "Applications", "Interviews", "Clients", "Placements"]);
    expect(sections[4].items.map((i) => i.text)).toEqual(["Reports", "Audit Log", "Branding", "Settings", "Plan & Billing"]);
    // one "Soon" row (D1): Plan & Billing; the pages that left the menu (HR, Finance, Domains, ...) are nowhere
    const all = sections.flatMap((s) => s.items);
    expect(all.filter((i) => i.soon).map((i) => i.key)).toEqual(["billing"]);
    expect(all.map((i) => i.key)).not.toEqual(expect.arrayContaining(["hr"]));
    expect(all.length).toBe(17);
    expect(all.find((i) => i.key === "employees")?.soon).toBeUndefined();
  });

  it("the Marketing and Consultant menus are grouped by the data's group labels", () => {
    const mkt = navSections(ws(me("acme.localhost", "marketer@acme.com"), "marketing"));
    expect(mkt.map((s) => [s.label, s.items.map((i) => i.text)])).toEqual([
      [null, ["Home"]],
      ["Talent", ["My Talent", "Resumes"]],
      ["Pipeline", ["Jobs", "Opportunities", "Submissions", "Applications", "Interviews"]],
      ["My work", ["Tasks", "Activity", "Performance"]],
    ]);
    const cons = navSections(ws(me("acme.localhost", "consultant@acme.com"), "consultant"));
    expect(cons.map((s) => [s.label, s.items.map((i) => i.text)])).toEqual([
      [null, ["Home"]],
      ["Me", ["My Profile", "My Resumes", "Availability"]],
      ["Work", ["Opportunities", "Submissions", "My Applications", "Interviews", "Offers", "My Placement"]],
      ["Keep up", ["Tasks", "Activity", "Email Tracking", "My Marketer"]],
      [null, ["Settings"]],
    ]);
  });

  it("an API that sends no groups gets one ungrouped list", () => {
    const m = me("acme.localhost", "marketer@acme.com");
    const bare = { ...ws(m, "marketing"), groups: undefined, nav: ws(m, "marketing").nav.map((n) => ({ ...n, group: undefined })) };
    expect(navSections(bare).map((s) => s.id)).toEqual(["main"]);
  });

  it("a marketer has no Administration workspace and no admin pages anywhere in the menu", () => {
    const m = me("acme.localhost", "marketer@acme.com");
    expect(m.workspaces.map((w) => w.key)).toEqual(["marketing"]);
    const all = keys(m, "marketing");
    expect(all).toContain("talent");
    expect(all).not.toContain("billing");
    expect(all).not.toContain("branding");
  });

  it("a consultant sees only their own workspace; finance sees money pages and not people admin", () => {
    expect(me("acme.localhost", "consultant@acme.com").workspaces.map((w) => w.key)).toEqual(["consultant"]);
    const fin = me("acme.localhost", "finance@acme.com");
    expect(fin.workspaces.map((w) => w.key)).toEqual(["finance"]);
    expect(keys(fin, "finance")).not.toContain("employees");
  });

  it("a workspace whose module is off disappears entirely (beta has no modules: only its own pages)", () => {
    const beta = me("beta.localhost", "owner@beta.com");
    // beta's modules are off: those pages are not open, they are flagged soon
    const billing = navSections(ws(beta, "admin")).flatMap((s) => s.items).find((i) => i.key === "billing");
    expect(billing?.soon).toBe(true);
    expect(navSections(ws(beta, "admin")).flatMap((s) => s.items).find((i) => i.key === "consultants")?.soon).toBe(true);
  });

  it("Plan & Billing reads 'Soon' whether or not the API lists it (D9: its page is a placeholder)", () => {
    const owner = me("acme.localhost", "owner@acme.com");
    const without = { ...owner, workspaces: owner.workspaces.map((w) => (w.key === "admin" ? { ...w, nav: w.nav.filter((n) => n.key !== "billing") } : w)) };
    for (const m of [owner, without]) {
      const billing = navSections(ws(m, "admin")).flatMap((s) => s.items).find((i) => i.key === "billing")!;
      expect(billing.soon).toBe(true);
      expect(billing.text).toBe("Plan & Billing");
    }
  });

  it("every Administration page that is not built reads Soon, and no built page is on that list", () => {
    const owner = me("acme.localhost", "owner@acme.com");
    const items = navSections(ws(owner, "admin")).flatMap((s) => s.items);
    for (const key of ADMIN_NOT_BUILT) {
      const item = items.find((i) => i.key === key);
      if (item) expect(item.soon, key).toBe(true);
    }
    const dir = resolve(__dirname, "../../app/(tenant)/%5Ft/w/[workspace]");
    const folders = new Set(readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
    for (const key of ADMIN_NOT_BUILT) expect(folders.has(key), `${key} has a page folder: take it off ADMIN_NOT_BUILT`).toBe(false);
  });

  it("the organization's terminology renames the entries it covers and nothing else", () => {
    const owner = me("acme.localhost", "owner@acme.com");
    const item = { key: "employees", label: "Employees" };
    expect(labelFor(item, { employees: "team members" })).toBe("Team members");
    expect(labelFor(item, {})).toBe("Employees");
    const beta = me("beta.localhost", "owner@beta.com");
    expect(navSections(ws(beta, "admin"), beta.org.terminology).flatMap((s) => s.items).find((i) => i.key === "employees")?.text).toBe("Team members");
    expect(navSections(ws(owner, "admin"), owner.org.terminology).flatMap((s) => s.items).find((i) => i.key === "employees")?.text).toBe("Employees");
  });
});

describe("the active item", () => {
  const owner = me("acme.localhost", "owner@acme.com");
  const admin = ws(owner, "admin");
  it("highlights the deepest page the URL is under; Home only on its exact path", () => {
    expect(activeKey(admin, "/w/admin")).toBe("home");
    expect(activeKey(admin, "/w/admin/employees")).toBe("employees");
    expect(activeKey(admin, "/w/admin/employees/42")).toBe("employees");
    expect(activeKey(admin, "/w/admin/unknown-page")).toBeNull();
  });
  it("a merged page's tabs keep its row highlighted (Invitations is a tab of Employees)", () => {
    expect(activeKey(admin, "/w/admin/employees", "tab=invitations")).toBe("employees");
    expect(activeKey(admin, "/w/admin/teams", "tab=departments")).toBe("teams");
  });
  it("titles a page by its menu label until the page supplies its own", () => {
    expect(defaultTitle(admin, "/w/admin/roles", "")).toBe("Roles");
    expect(defaultTitle(admin, "/w/admin", "")).toBe("Dashboard");
  });
});

describe("search over the member's permitted pages", () => {
  const sarah = me("acme.localhost", "sarah@acme.com");
  it("ranks prefix matches first and spans every workspace the member holds", () => {
    const hits = searchPages(sarah, "app");
    expect(hits[0].label).toBe("Applications");
    expect(searchPages(sarah, "approvals").map((h) => h.workspace)).toContain("Marketing management");
  });
  it("never offers a page the member's menus do not list", () => {
    const marketer = me("acme.localhost", "marketer@acme.com");
    expect(searchPages(marketer, "billing")).toEqual([]);
    expect(searchPages(marketer, "branding")).toEqual([]);
  });
  it("an empty query lists the first pages, de-duplicated by address", () => {
    const hits = searchPages(sarah, "", 50);
    expect(new Set(hits.map((h) => h.href)).size).toBe(hits.length);
  });
});

describe("workspaces and the switcher (16 s4)", () => {
  const sarah = me("acme.localhost", "sarah@acme.com");
  it("Sarah has two workspaces, landing on Administration; the rows name the granting roles", () => {
    const rows = switcherRows(sarah, "admin");
    expect(rows.map((r) => [r.key, r.current, r.landing])).toEqual([["admin", true, true], ["marketing-mgmt", false, false]]);
    expect(rows[1].roles).toBe("Marketing Manager");
  });
  it("a saved 'open this first' choice moves the landing chip; an unknown one is ignored", () => {
    expect(switcherRows(sarah, "admin", "marketing-mgmt").find((r) => r.landing)?.key).toBe("marketing-mgmt");
    expect(switcherRows(sarah, "admin", "hr").find((r) => r.landing)?.key).toBe("admin");
  });
  it("a URL naming a workspace the member does not hold falls back to the landing one with allowed=false", () => {
    expect(shellWorkspace(sarah, "hr")).toMatchObject({ allowed: false, ws: { key: "admin" } });
    expect(shellWorkspace(sarah, "marketing-mgmt")).toMatchObject({ allowed: true });
    expect(primaryRoleName(sarah)).toBe("Organization Admin");
  });
});

describe("the catch-all (pages not built yet)", () => {
  const owner = me("acme.localhost", "owner@acme.com");
  it("a page the menu lists resolves to its title, so the sidebar never leads to a 404", () => {
    for (const s of navSections(ws(owner, "admin")).flatMap((sec) => sec.items)) {
      const slug = s.href.split(/[?#]/)[0].replace("/w/admin", "").split("/").filter(Boolean);
      // Invitations and Departments share a path with Employees / Teams (the query or hash tells them apart): the title may be the sibling's
      expect(catchAllPage(owner, "admin", slug).kind, s.key).toBe("page");
    }
    expect(catchAllPage(owner, "admin", ["roles"])).toEqual({ kind: "page", title: "Roles" });
    expect(catchAllPage(owner, "admin", [])).toEqual({ kind: "page", title: "Dashboard" });
  });
  it("a path the member's menu does not list is denied (no data, the API is the real gate)", () => {
    expect(catchAllPage(owner, "admin", ["billing"])).toEqual({ kind: "page", title: "Plan & Billing" }); // listed as soon: the honest "on the way" page
    expect(catchAllPage(owner, "admin", ["hr"])).toEqual({ kind: "denied" }); // left the Administration menu (D1)
    expect(catchAllPage(owner, "admin", ["nothing-here"])).toEqual({ kind: "denied" });
    expect(catchAllPage(owner, "hr", [])).toEqual({ kind: "denied" });
  });
});

describe("banners by permission", () => {
  const owner = me("acme.localhost", "owner@acme.com");
  const mkt = me("acme.localhost", "marketer@acme.com");
  it("access-changed always shows when the check said so", () => {
    expect(bannersFor(mkt, ws(mkt, "marketing"), true).map((b) => b.id)).toEqual(["access-changed"]);
  });
  it("past-due is for members who can see billing, with the page to open", () => {
    const due = { ...owner, org: { ...owner.org, flags: { ...owner.org.flags, pastDue: true } } };
    expect(bannersFor(due, ws(due, "admin"), false)).toEqual([{ id: "past-due", href: "/w/admin/billing" }]);
    const dueMkt = { ...mkt, org: { ...mkt.org, flags: { ...mkt.org.flags, pastDue: true } } };
    expect(bannersFor(dueMkt, ws(dueMkt, "marketing"), false)).toEqual([]);
  });
});
