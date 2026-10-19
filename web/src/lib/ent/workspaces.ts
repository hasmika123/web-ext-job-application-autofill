/**
 * Workspace types and helpers for the tenant shell (X2.2; docs/enterprise-v2/16-ui-ux-page-inventory.md sections 2.2-2.4, 3, 4).
 *
 * The workspace DEFINITIONS are data owned by the API (`api/src/main/resources/config/ent/workspaces.json`): the API filters each
 * workspace's navigation by the member's real permissions and the organization's modules before it answers `GET /api/me/tenant`,
 * so this file holds no copy of the page tables. It only types the contract and answers the questions the shell asks of it.
 * Nothing here is a gate: the API re-checks every page.
 */

export const MODULE_KEYS = ["domains", "roles", "billing", "marketing", "hrFinance", "extensionWorkspaces", "integrations", "analytics"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * `badge: "attention"` shows a dot (invitations waiting, approvals waiting). `icon` names an `@kiwiply/ui` icon without the `Icon` suffix.
 * `group` is the key of one of the workspace's `groups` the menu draws the item under (none: drawn without a label).
 */
export interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
  badge?: "attention" | null;
  group?: string | null;
}

/** A labelled group of menu rows ("People", "Pipeline"): display only. */
export interface NavGroup {
  key: string;
  label: string;
}

export interface Workspace {
  /** URL slug: `admin`, `marketing-mgmt`. */
  key: string;
  /** Stored key: `ADMIN`, `MARKETING_MGMT` (what a role's workspace and the landing preference hold). */
  workspaceKey: string;
  label: string;
  /** `/w/<slug>`. */
  home: string;
  order: number;
  /** The member's roles that grant this workspace, primary first. */
  roleKeys: string[];
  nav: NavItem[];
  /** Nav keys for the phone's bottom bar (first four; the rest sit under More). */
  bottomTabs: string[];
  /** The menu's group labels in order (an older API sends none: the menu is then one ungrouped list). */
  groups?: NavGroup[];
}

export interface MeRole {
  id: number | null;
  key: string;
  name: string;
  /** A short label for tight places (the profile chip); the API may send it, else the shell derives one from `name`. */
  shortName?: string | null;
  isPrimary: boolean;
  workspaceKey: string | null;
}

export type PermissionScope = "OWN" | "ASSIGNED" | "TEAM" | "DEPARTMENT" | "ORG";

/** Mirrors the API's MeTenantDTO. Only what the shell needs is typed strictly; every list may be empty, none may be missing. */
export interface MeTenant {
  org: {
    id: number;
    displayName: string;
    status: string;
    type: string | null;
    primaryHost: string | null;
    terminology: Record<string, string>;
    flags: { pastDue: boolean; billingActionRequired: boolean; greeting: boolean };
  };
  member: { id: number; status: string; title: string | null; joinedAt: string | null };
  person: { name: string; email: string | null; imageUrl: string | null };
  roles: MeRole[];
  permissions: Record<string, PermissionScope>;
  modules: Record<ModuleKey, boolean>;
  workspaces: Workspace[];
  /** Home of the landing workspace; null when the member can open none. */
  landing: string | null;
  landingKey: string | null;
  consent: { scope: "NONE" | "SUMMARY" | "FULL"; fullTo: number | null };
  features: { licensed: string[]; pending: boolean };
}

/** The workspaces this member may open, in display order (the API already filtered them). */
export function workspacesFor(me: MeTenant): Workspace[] {
  return me.workspaces;
}

/** Where a signed-in member lands: the API's choice (saved preference, else primary role), or null when they have no workspace. */
export function landingFor(me: MeTenant): string | null {
  return me.landing && me.workspaces.some((w) => w.home === me.landing) ? me.landing : (me.workspaces[0]?.home ?? null);
}

/** The workspace for a URL slug, or undefined: the layout then renders "This isn't part of your role" (no redirect). */
export function findWorkspace(me: MeTenant, slug: string): Workspace | undefined {
  return me.workspaces.find((w) => w.key === slug);
}

/** The switcher is shown only when there is something to switch to (16 section 3). */
export function showSwitcher(me: MeTenant): boolean {
  return me.workspaces.length > 1;
}

/** Whether a nav href (or path) belongs to a page this member's menu lists; the shell never greys, it just omits. */
export function listsPage(ws: Workspace, pathname: string): boolean {
  const clean = pathname.split("?")[0].split("#")[0];
  return ws.nav.some((n) => n.href.split("?")[0].split("#")[0] === clean);
}

/** The phone's bottom tabs: the documented ones that survived filtering, then everything else goes under More. */
export function bottomBar(ws: Workspace): { tabs: NavItem[]; more: NavItem[] } {
  const tabs = ws.bottomTabs.map((k) => ws.nav.find((n) => n.key === k)).filter((n): n is NavItem => !!n);
  const tabKeys = new Set(tabs.map((n) => n.key));
  return { tabs, more: ws.nav.filter((n) => !tabKeys.has(n.key)) };
}

/** True when the member holds the permission key at any scope (for hiding a button; the API is the gate). */
export function can(me: MeTenant, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(me.permissions, key);
}
