// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { ToastProvider } from "@kiwiply/ui";
import type { Catalog, CatalogEntry, RolePermission, RolesOverview } from "@/lib/ent/roles";
import RolesPage from "./RolesPage";

/* ── a tiny in-memory roles API behind the BFF's URLs ───────────────────────────────────────────── */

interface Srv {
  id: number;
  key: string;
  name: string;
  description: string | null;
  templateKey: string | null;
  system: boolean;
  assigned: number;
  perms: RolePermission[];
  v: number;
}

const p = (key: string, scope: RolePermission["scope"]): RolePermission => ({ key, scope, ceilingRoleKey: null, rowFilter: null });
const self = [p("self.leave", "OWN"), p("self.share_scope.set", "OWN")];

const entry = (key: string, family: string, label: string, over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  key, family, label, description: `${label}.`, dangerous: false, actsForOthers: false, defaultScope: "ORG",
  scopes: [
    { scope: "TEAM", grantable: true, ceilingRoleKey: null, rowFilter: null },
    { scope: "ORG", grantable: true, ceilingRoleKey: null, rowFilter: null },
  ],
  grantable: true, reason: null, ...over,
});

const CATALOG = (canManage = true): Catalog => ({
  canManage,
  totalKeys: 5,
  permissionSets: 4,
  categories: [
    { key: "CORE_PLATFORM", label: "Core Platform", keyCount: 1, permissionSets: 1, permissions: [entry("reports.view", "reports", "Reports view")] },
    { key: "RECRUITING", label: "Recruiting", keyCount: 1, permissionSets: 1, permissions: [entry("pipeline.view", "pipeline", "Pipeline view")] },
    {
      key: "CONSULTANTS", label: "Consultants", keyCount: 1, permissionSets: 1,
      permissions: [
        entry("assignments.manage", "assignments", "Assignments manage", {
          scopes: [
            { scope: "TEAM", grantable: true, ceilingRoleKey: null, rowFilter: null },
            { scope: "ORG", grantable: false, ceilingRoleKey: null, rowFilter: null },
          ],
        }),
      ],
    },
    { key: "FINANCE", label: "Finance", keyCount: 1, permissionSets: 1, permissions: [entry("billing.manage", "billing", "Billing manage", { dangerous: true })] },
    {
      key: "ADMINISTRATION", label: "Administration", keyCount: 1, permissionSets: 1,
      permissions: [
        entry("org.close", "org", "Org close", {
          dangerous: true, grantable: false, reason: "OWNER_ONLY",
          scopes: [{ scope: "ORG", grantable: false, ceilingRoleKey: null, rowFilter: null }],
        }),
      ],
    },
  ].map((c) => ({ ...c, keyCount: c.permissions.length })),
});

let roles: Srv[];
let nextId: number;
let calls: { method: string; url: string; body: unknown; ifMatch: string | null }[];
let catalog: Catalog;
let failNext: { match: RegExp; status: number; body: Record<string, unknown> } | null;

const version = (r: Srv) => `W/"${r.id}-${r.v}"`;
const detail = (r: Srv) => ({
  id: r.id, key: r.key, name: r.name, description: r.description, templateKey: r.templateKey, system: r.system, editable: !r.system, workspaceKey: null,
  scopeLabel: r.system ? "Organization" : "Custom", status: "ACTIVE", assignedUsers: r.assigned, version: version(r), permissions: r.perms,
});
const overview = (): RolesOverview => ({
  roles: roles.map((r) => ({
    id: r.id, key: r.key, name: r.name, description: r.description, templateKey: r.templateKey, scopeLabel: r.system ? "Organization" : "Custom", scopeLevel: "ORG",
    system: r.system, editable: !r.system, status: "ACTIVE", assignedUsers: r.assigned, permissionCount: r.perms.length, version: version(r),
  })),
  totalRoles: roles.length, activeUsers: 186, customRoleCount: roles.filter((r) => !r.system).length, systemRoleCount: roles.filter((r) => r.system).length,
  totalPermissionKeys: 5,
  permissionOverview: [
    { category: "CORE_PLATFORM", label: "Core Platform", keys: 1, grantedKeys: 1, percent: 20, permissionSets: 1 },
    { category: "RECRUITING", label: "Recruiting", keys: 1, grantedKeys: 1, percent: 20, permissionSets: 1 },
    { category: "CONSULTANTS", label: "Consultants", keys: 1, grantedKeys: 1, percent: 20, permissionSets: 1 },
    { category: "FINANCE", label: "Finance", keys: 1, grantedKeys: 0, percent: 20, permissionSets: 1 },
    { category: "ADMINISTRATION", label: "Administration", keys: 1, grantedKeys: 1, percent: 20, permissionSets: 1 },
  ],
  permissionSetCount: 4,
});

function seed() {
  roles = [
    { id: 1, key: "ORG_ADMIN", name: "Organization Admin", description: "Runs the organization", templateKey: null, system: true, assigned: 12, perms: [p("reports.view", "ORG"), p("billing.manage", "ORG"), ...self], v: 1 },
    { id: 2, key: "OWNER", name: "Owner", description: "Everything", templateKey: null, system: true, assigned: 1, perms: [p("reports.view", "ORG"), p("org.close", "ORG"), ...self], v: 1 },
    { id: 3, key: "MARKETING_MANAGER", name: "Marketing Manager", description: "Leads marketing", templateKey: null, system: true, assigned: 4, perms: [p("reports.view", "TEAM"), p("assignments.manage", "TEAM"), ...self], v: 1 },
    { id: 10, key: "CUSTOM_REGIONAL_LEAD", name: "Regional lead", description: "Leads a region", templateKey: "MARKETING_MANAGER", system: false, assigned: 0, perms: [p("reports.view", "TEAM"), p("assignments.manage", "TEAM"), ...self], v: 1 },
    { id: 11, key: "CUSTOM_USED", name: "Used role", description: null, templateKey: null, system: false, assigned: 2, perms: [p("pipeline.view", "ORG"), ...self], v: 1 },
  ];
  nextId = 20;
  calls = [];
  failNext = null;
  catalog = CATALOG();
}

function install() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      const method = init.method ?? "GET";
      const raw = init.body;
      const body = typeof raw === "string" ? JSON.parse(raw) : undefined;
      calls.push({ method, url, body, ifMatch: headers["if-match"] ?? null });
      const reply = (status: number, b: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => b }) as Response;
      if (failNext && failNext.match.test(`${method} ${url}`)) {
        const f = failNext;
        failNext = null;
        return reply(f.status, f.body);
      }
      const base = "/api/orgs/2";
      if (url === `${base}/roles/overview`) return reply(200, overview());
      if (url === `${base}/permissions`) return reply(200, catalog);
      if (url.startsWith(`${base}/roles/history`)) return reply(200, [{ id: 1, action: "ROLE_UPDATE", risk: "HIGH", actor: "olivia", targetType: "ROLE", targetId: "10", targetLogin: null, roleName: "Regional lead", at: "2026-10-13T09:00:00Z", details: { added: ["pipeline.view@ORG"], removed: [] } }]);
      if (method === "POST" && url === `${base}/roles`) {
        const src = body.sourceRoleId ? roles.find((r) => r.id === body.sourceRoleId) : body.templateKey ? roles.find((r) => r.key === body.templateKey) : null;
        const perms: RolePermission[] = body.permissions ? [...body.permissions.map((x: { key: string; scope: RolePermission["scope"] }) => p(x.key, x.scope)), ...self] : src ? src.perms : self;
        const r: Srv = { id: nextId++, key: `CUSTOM_${String(body.name).toUpperCase().replace(/\W+/g, "_")}`, name: body.name, description: body.description ?? src?.description ?? null, templateKey: body.templateKey ?? null, system: false, assigned: 0, perms, v: 1 };
        roles.push(r);
        return reply(201, detail(r));
      }
      const one = /\/roles\/(\d+)(\/diff|\/history|\/resync)?$/.exec(url);
      if (one) {
        const r = roles.find((x) => x.id === Number(one[1]));
        if (!r) return reply(404, { error: "Not found." });
        if (one[2] === "/diff") {
          const tpl = roles.find((x) => x.key === r.templateKey);
          if (!tpl || r.system) return reply(200, { roleId: r.id, template: null, templateName: null, hasTemplate: false, matches: true, added: [], removed: [], scopeChanged: [], attributesChanged: [] });
          const added = r.perms.filter((x) => !tpl.perms.some((y) => y.key === x.key)).map((x) => ({ key: x.key, scope: x.scope }));
          const removed = tpl.perms.filter((x) => !r.perms.some((y) => y.key === x.key)).map((x) => ({ key: x.key, scope: x.scope }));
          const scopeChanged = r.perms.filter((x) => tpl.perms.some((y) => y.key === x.key && y.scope !== x.scope)).map((x) => ({ key: x.key, from: tpl.perms.find((y) => y.key === x.key)!.scope, to: x.scope }));
          return reply(200, { roleId: r.id, template: tpl.key, templateName: tpl.name, hasTemplate: true, matches: !added.length && !removed.length && !scopeChanged.length, added, removed, scopeChanged, attributesChanged: [] });
        }
        if (one[2] === "/resync") {
          const tpl = roles.find((x) => x.key === r.templateKey)!;
          r.perms = tpl.perms;
          r.v++;
          return reply(200, detail(r));
        }
        if (method === "GET") return reply(200, detail(r));
        if (method === "PATCH") {
          if (headers["if-match"] !== version(r)) return reply(412, { error: "The role changed since you loaded it", code: "PRECONDITION_FAILED", currentVersion: version(r) });
          if (body.name) r.name = body.name;
          if (body.permissions) r.perms = [...body.permissions.map((x: { key: string; scope: RolePermission["scope"] }) => p(x.key, x.scope)), ...self];
          r.v++;
          return reply(200, detail(r));
        }
        if (method === "DELETE") {
          if (r.assigned > 0) return reply(409, { error: "in use", code: "ROLE_IN_USE", count: r.assigned });
          roles = roles.filter((x) => x.id !== r.id);
          return { ok: true, status: 204, json: async () => ({}) } as Response;
        }
      }
      return reply(404, { error: "no route" });
    }),
  );
}

function setNarrow(on: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("max-width: 767px"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
}

async function mount(canManage = true) {
  const out = render(
    <ToastProvider>
      <RolesPage orgId={2} orgName="Acme" workspace="admin" canManage={canManage} supportEmail="it@acme.com" />
    </ToastProvider>,
  );
  await act(async () => {});
  await waitFor(() => expect(document.querySelector("[data-kpi-value]")?.textContent).not.toBe("–"));
  return out;
}

const rowOf = (name: string): HTMLElement => {
  const cell = screen.getAllByText(name).find((n) => n.closest("tr, li"));
  return cell!.closest("tr, li") as HTMLElement;
};

async function openMenu(name: string) {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name: /row actions/i }));
  await act(async () => {});
}

const kpi = (label: string) => document.querySelector(`[data-kpi="${label}"] [data-kpi-value]`)?.textContent;
const editor = () => document.querySelector("[data-role-editor]") as HTMLElement;
const permRow = (key: string) => document.querySelector(`[data-perm-row="${key}"]`) as HTMLElement;

beforeEach(() => {
  seed();
  install();
  setNarrow(false);
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ── the page ───────────────────────────────────────────────────────────────────────────────────── */

describe("Roles & Permissions page: the list", () => {
  it("shows the real numbers, the roles with their users, the donut and no trend lines", async () => {
    await mount();
    expect(kpi("Total Roles")).toBe("5");
    expect(kpi("Active Users")).toBe("186");
    expect(kpi("Permission Sets")).toBe("4");
    expect(kpi("Custom Roles")).toBe("2");
    expect(document.body.textContent).not.toMatch(/vs last month/i);
    expect(within(rowOf("Organization Admin")).getByText("Organization")).toBeTruthy();
    expect(rowOf("Organization Admin").querySelector("[data-assigned-users]")?.getAttribute("data-assigned-users")).toBe("12");
    expect(within(rowOf("Regional lead")).getByText("Custom")).toBeTruthy();
    expect(document.querySelectorAll("[data-slice]")).toHaveLength(5);
    expect(document.querySelector("[data-donut]")?.getAttribute("aria-label")).toMatch(/Core Platform: 1/);
    expect(screen.getByText("Need help setting up roles?")).toBeTruthy();
    expect(screen.getByText("Ask a question...")).toBeTruthy();
  });

  it("filters the table by the search box", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search roles"), { target: { value: "regional" } });
    expect(screen.queryByText("Organization Admin")).toBeNull();
    expect(screen.getAllByText("Regional lead").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Search roles"), { target: { value: "zzz" } });
    expect(screen.getByText("No roles match your search.")).toBeTruthy();
  });

  it("is a read-only list without roles.manage: no Create Role, no duplicate, no delete, view and assign only", async () => {
    await mount(false);
    expect(screen.queryByText("Create Role")).toBeNull();
    expect(document.querySelector("[data-quick=create]")).toBeNull();
    expect(document.querySelector("[data-quick=audit]")).toBeNull();
    await openMenu("Regional lead");
    expect(screen.getByRole("menuitem", { name: /View permissions/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Assign users/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Duplicate/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Delete/ })).toBeNull();
  });

  it("the row menu: Delete is off for a role in use and names how many; Assign users goes to Employees filtered by the role", async () => {
    await mount();
    await openMenu("Used role");
    const del = screen.getByRole("menuitem", { name: /Delete \(used by 2\)/ });
    expect((del as HTMLButtonElement).disabled || del.getAttribute("aria-disabled") === "true").toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: /Assign users/ }));
    expect(push).toHaveBeenCalledWith("/w/admin/employees?role=11");
  });

  it("system roles have no Delete at all", async () => {
    await mount();
    await openMenu("Marketing Manager");
    expect(screen.queryByRole("menuitem", { name: /Delete/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toBeTruthy();
  });

  it("becomes cards on a phone", async () => {
    setNarrow(true);
    await mount();
    expect(document.querySelector("table")).toBeNull();
    const list = screen.getByRole("list", { name: "Roles" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
  });

  it("the Permission Sets tab groups the catalog read-only and the quick action opens it", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-quick=sets]")!);
    await act(async () => {});
    expect(document.querySelector("[data-permission-sets]")).not.toBeNull();
    expect(document.querySelectorAll("[data-sets-category]")).toHaveLength(5);
    expect(document.body.textContent).toMatch(/4 sets across 5 permissions/);
  });

  it("shows an error state with a retry when the overview cannot load", async () => {
    failNext = { match: /overview/, status: 500, body: { error: "The server had a problem." } };
    render(
      <ToastProvider>
        <RolesPage orgId={2} orgName="Acme" workspace="admin" canManage />
      </ToastProvider>,
    );
    await act(async () => {});
    expect(await screen.findByText(/The server had a problem/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await waitFor(() => expect(kpi("Total Roles")).toBe("5"));
  });
});

describe("create, duplicate, delete with undo", () => {
  it("creates a blank role, opens its editor and offers Undo", async () => {
    await mount();
    fireEvent.click(screen.getByText("Create Role"));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText(/Role name/), { target: { value: "Night shift lead" } });
    fireEvent.click(document.querySelector("[data-create-submit]")!);
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/roles"))).toBeTruthy());
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/roles"))!;
    expect(post.body).toEqual({ name: "Night shift lead" });
    await waitFor(() => expect(editor()).not.toBeNull());
    expect(screen.getByText(/Night shift lead created/)).toBeTruthy();
    // Undo deletes it again
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(roles.some((r) => r.name === "Night shift lead")).toBe(false);
  });

  it("from a template: sends the template key", async () => {
    await mount();
    fireEvent.click(screen.getByText("Create Role"));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText(/Role name/), { target: { value: "Recruiter" } });
    fireEvent.click(screen.getByRole("radio", { name: "A template" }));
    fireEvent.click(document.querySelector("[data-create-submit]")!);
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeTruthy());
    const body = calls.find((c) => c.method === "POST")!.body as { templateKey?: string };
    expect(body.templateKey).toBe("ORG_ADMIN");
  });

  it("duplicates a role from its menu: the name is suggested and the copy is sent", async () => {
    await mount();
    await openMenu("Regional lead");
    fireEvent.click(screen.getByRole("menuitem", { name: /Duplicate/ }));
    await act(async () => {});
    expect((screen.getByLabelText(/Role name/) as HTMLInputElement).value).toBe("Regional lead copy");
    fireEvent.click(document.querySelector("[data-create-submit]")!);
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeTruthy());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "Regional lead copy", sourceRoleId: 10 });
    await waitFor(() => expect(screen.getByText(/Regional lead copy duplicated/)).toBeTruthy());
  });

  it("a taken name stays in the dialog with the reason", async () => {
    await mount();
    failNext = { match: /POST \/api\/orgs\/2\/roles$/, status: 409, body: { error: "x", code: "ROLE_NAME_TAKEN" } };
    fireEvent.click(screen.getByText("Create Role"));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText(/Role name/), { target: { value: "Owner" } });
    fireEvent.click(document.querySelector("[data-create-submit]")!);
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(document.querySelector("[data-create-role]")).not.toBeNull();
  });

  it("deletes an unused custom role with its version, and Undo brings it back with its permissions", async () => {
    await mount();
    await openMenu("Regional lead");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Delete/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toBe("/api/orgs/2/roles/10");
    expect(del.ifMatch).toBe('W/"10-1"');
    await waitFor(() => expect(screen.getByText("Regional lead deleted")).toBeTruthy());
    expect(roles.some((r) => r.id === 10)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(roles.some((r) => r.name === "Regional lead")).toBe(true));
    const back = calls.filter((c) => c.method === "POST").pop()!.body as { name: string; templateKey: string; permissions: { key: string; scope: string }[] };
    expect(back.templateKey).toBe("MARKETING_MANAGER");
    expect(back.permissions).toEqual([
      { key: "assignments.manage", scope: "TEAM" },
      { key: "reports.view", scope: "TEAM" },
    ]);
  });

  it("an API refusal to delete shows the reason on the page", async () => {
    await mount();
    await openMenu("Regional lead");
    failNext = { match: /DELETE/, status: 409, body: { error: "x", code: "ROLE_IN_USE", count: 3 } };
    fireEvent.click(screen.getByRole("menuitem", { name: /^Delete/ }));
    expect(await screen.findByText(/Used by 3 people/)).toBeTruthy();
    expect(roles.some((r) => r.id === 10)).toBe(true);
  });

  it("the audit quick action opens the history drawer with what the API says", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-quick=audit]")!);
    expect(await screen.findByText(/Role changed · Regional lead/)).toBeTruthy();
    expect(screen.getByText(/\+pipeline.view@ORG/)).toBeTruthy();
    expect(screen.getByText(/by olivia/)).toBeTruthy();
  });
});

/* ── the editor ─────────────────────────────────────────────────────────────────────────────────── */

async function openEditor(name: string) {
  fireEvent.click(rowOf(name));
  await waitFor(() => expect(editor()).not.toBeNull());
  await waitFor(() => expect(permRow("reports.view")).toBeTruthy());
}

const scopeButton = (key: string, label: string) => within(permRow(key)).getByRole("radio", { name: label }) as HTMLButtonElement;

describe("the role editor", () => {
  it("a system role is read only, says so, and offers Duplicate to customise (never for Owner)", async () => {
    await mount();
    await openEditor("Marketing Manager");
    expect(document.querySelector("[data-role-system]")).not.toBeNull();
    expect(document.querySelector("[data-duplicate-to-customise]")).not.toBeNull();
    expect(within(permRow("reports.view")).queryByRole("radio")).toBeNull();
    expect(permRow("reports.view").textContent).toMatch(/Team/);
    expect(document.querySelector("[data-editor-footer]")).toBeNull();
    cleanup();
    seed();
    await mount();
    await openEditor("Owner");
    expect(document.querySelector("[data-role-system]")).not.toBeNull();
    expect(document.querySelector("[data-duplicate-to-customise]")).toBeNull();
  });

  it("groups permissions by category and filters by search and granted-only", async () => {
    await mount();
    await openEditor("Regional lead");
    expect(document.querySelectorAll("[data-perm-category]")).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("Search permissions"), { target: { value: "billing" } });
    expect(document.querySelectorAll("[data-perm-row]")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search permissions"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("switch", { name: /Granted only/i }));
    expect([...document.querySelectorAll("[data-perm-row]")].map((r) => r.getAttribute("data-perm-row")).sort()).toEqual(["assignments.manage", "reports.view"]);
  });

  it("shows ceiling states: beyond-your-access scopes and Owner-only keys are disabled with the reason", async () => {
    await mount();
    await openEditor("Regional lead");
    expect(scopeButton("assignments.manage", "Organization").disabled).toBe(true);
    expect(scopeButton("assignments.manage", "Team").disabled).toBe(false);
    const close = permRow("org.close");
    expect(close.getAttribute("data-perm-locked")).toBe("true");
    expect(within(close).getByText(/Only the Owner holds this/)).toBeTruthy();
    expect(scopeButton("org.close", "Organization").disabled).toBe(true);
    expect(scopeButton("org.close", "Not granted").getAttribute("aria-checked")).toBe("true");
  });

  it("is view only when the role holds something beyond the caller's access", async () => {
    roles[3].perms = [p("assignments.manage", "ORG"), ...self]; // the caller cannot give ORG
    await mount();
    await openEditor("Regional lead");
    expect(document.querySelector("[data-role-beyond]")).not.toBeNull();
    expect(within(permRow("reports.view")).queryByRole("radio")).toBeNull();
  });

  it("changing a scope shows the footer; Review changes lists added, removed and moved, then saves with If-Match", async () => {
    await mount();
    await openEditor("Regional lead");
    fireEvent.click(scopeButton("reports.view", "Organization")); // moved
    fireEvent.click(scopeButton("assignments.manage", "Not granted")); // removed
    fireEvent.click(scopeButton("billing.manage", "Organization")); // added, sensitive
    expect(document.querySelector("[data-editor-footer]")?.textContent).toMatch(/3 permission changes/);
    fireEvent.click(document.querySelector("[data-review-changes]")!);
    await act(async () => {});
    const list = document.querySelector("[data-change-list]") as HTMLElement;
    expect(within(list).getByText("Added (1)")).toBeTruthy();
    expect(within(list).getByText("Removed (1)")).toBeTruthy();
    expect(within(list).getByText("Scope changed (1)")).toBeTruthy();
    expect(list.textContent).toMatch(/Billing manage/);
    expect(document.querySelector("[data-change-sensitive]")?.textContent).toMatch(/Billing manage/);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false); // nothing is written before the confirm
    fireEvent.click(document.querySelector("[data-confirm-go]")!);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.ifMatch).toBe('W/"10-1"');
    expect(patch.body).toEqual({
      permissions: [
        { key: "billing.manage", scope: "ORG" },
        { key: "reports.view", scope: "ORG" },
      ],
    });
    await waitFor(() => expect(screen.getByText("Role updated")).toBeTruthy());
    expect(document.querySelector("[data-editor-footer]")).toBeNull(); // saved: nothing pending
  });

  it("Discard puts everything back and writes nothing", async () => {
    await mount();
    await openEditor("Regional lead");
    fireEvent.click(scopeButton("reports.view", "Organization"));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(scopeButton("reports.view", "Team").getAttribute("aria-checked")).toBe("true");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("a ceiling refusal stays in the confirm step as one sentence and marks the row", async () => {
    await mount();
    await openEditor("Regional lead");
    fireEvent.click(scopeButton("billing.manage", "Organization"));
    fireEvent.click(document.querySelector("[data-review-changes]")!);
    await act(async () => {});
    failNext = { match: /PATCH/, status: 422, body: { error: "x", code: "ROLE_CEILING", key: "billing.manage", scope: "ORG" } };
    fireEvent.click(document.querySelector("[data-confirm-go]")!);
    expect((await screen.findAllByText("You can't give billing.manage at organization level: you don't hold it yourself.")).length).toBeGreaterThan(0);
    fireEvent.click(document.querySelector("[data-confirm-cancel]")!);
    await act(async () => {});
    expect(permRow("billing.manage").className).toMatch(/danger/);
  });

  it("a newer version shows 'this role changed' with a reload that drops the edits", async () => {
    await mount();
    await openEditor("Regional lead");
    fireEvent.click(scopeButton("reports.view", "Organization"));
    roles[3].v = 5; // someone else saved
    fireEvent.click(document.querySelector("[data-review-changes]")!);
    await act(async () => {});
    fireEvent.click(document.querySelector("[data-confirm-go]")!);
    expect((await screen.findAllByText(/changed while you were editing/i)).length).toBeGreaterThan(0);
    fireEvent.click(document.querySelector("[data-confirm-cancel]")!);
    await act(async () => {});
    expect(document.querySelector("[data-role-stale]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Reload/ }));
    await waitFor(() => expect(document.querySelector("[data-role-stale]")).toBeNull());
    expect(scopeButton("reports.view", "Team").getAttribute("aria-checked")).toBe("true");
  });

  it("shows the diff chip, expands the differences, and restores to the template after a diff-first confirm", async () => {
    roles[3].perms = [p("reports.view", "ORG"), p("pipeline.view", "ORG"), ...self]; // vs the manager: ~reports, +pipeline, -assignments
    await mount();
    await openEditor("Regional lead");
    const chip = document.querySelector("[data-diff-chip=differs]") as HTMLElement;
    expect(chip.textContent).toMatch(/Differs from Marketing Manager/);
    expect(chip.textContent).toMatch(/\+1/);
    fireEvent.click(chip);
    expect(document.querySelector("[data-diff-details]")?.textContent).toMatch(/Pipeline view/);
    fireEvent.click(document.querySelector("[data-restore-template]")!);
    await act(async () => {});
    const list = document.querySelector("[data-change-list]") as HTMLElement;
    expect(within(list).getByText("Added (1)")).toBeTruthy(); // the dropped assignments.manage comes back
    expect(list.textContent).toMatch(/Assignments manage/);
    fireEvent.click(document.querySelector("[data-confirm-go]")!);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/resync"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/resync"))!.ifMatch).toBe('W/"10-1"');
    await waitFor(() => expect(document.querySelector("[data-diff-chip=match]")).not.toBeNull());
  });

  it("a read-only viewer sees pills, not controls, and the reason", async () => {
    catalog = CATALOG(false);
    await mount(false);
    await openEditor("Regional lead");
    expect(document.querySelector("[data-role-readonly]")).not.toBeNull();
    expect(within(permRow("reports.view")).queryByRole("radio")).toBeNull();
    expect(permRow("reports.view").querySelector("[data-perm-pill]")?.textContent).toBe("Team");
  });

  it("renaming alone saves without a permission summary", async () => {
    await mount();
    await openEditor("Regional lead");
    fireEvent.change(document.querySelector("[data-role-name]") as HTMLInputElement, { target: { value: "Regional chief" } });
    fireEvent.click(document.querySelector("[data-review-changes]")!);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ name: "Regional chief" });
    expect(document.querySelector("[data-confirm-changes]")).toBeNull();
  });
});
