/**
 * Pure helpers behind the tenant shell (X2.16; docs/enterprise-v2/16 s2-s4). No React, no Next: everything the sidebar, the
 * search box, the switcher and the page header decide is a function of the X2.2 session (`MeTenant`), so it is table-testable.
 *
 * The menu itself is DATA the API already filtered by the member's permissions and the organization's modules
 * (`GET /api/me/tenant`, X2.2): this file only GROUPS it for display, labels it with the organization's own words and answers
 * "which item is active". It never adds an item and never greys one out: a page the member cannot open is simply absent.
 */
import type { MeTenant, NavItem, Workspace } from "@/lib/ent/workspaces";

/** The Administration menu's group labels, for an API that does not send them yet (the data in workspaces.json wins). */
const ADMIN_GROUP_LABELS: Record<string, string> = { people: "People", talent: "Talent", pipeline: "Pipeline", organization: "Organization" };

/**
 * Administration pages whose route is still the "on the way" placeholder, whether or not the API lists them for this member. Take a key out of this
 * set in the same change that builds its page (the sidebar test fails if one is both built and listed here).
 */
export const ADMIN_NOT_BUILT: ReadonlySet<string> = new Set(["subscription", "licenses", "billing", "usage", "hr", "finance", "domains", "integrations"]);

/**
 * The whole Administration menu in order, with its groups. The API sends only the items a member may open with their modules on; the others
 * are shown too, greyed with a "Soon" chip and leading to the honest "on the way" page, so the menu always reads as the full product.
 * Everything the API does send wins over this list (its href, label, icon, group).
 */
const ADMIN_FULL: { key: string; label: string; icon: string; href: string; group?: string }[] = [
  { key: "home", label: "Dashboard", icon: "Home", href: "/w/admin" },
  { key: "employees", label: "Employees", icon: "Users", href: "/w/admin/employees", group: "people" },
  { key: "invitations", label: "Invitations", icon: "Mail", href: "/w/admin/invitations", group: "people" },
  { key: "teams", label: "Teams", icon: "Network", href: "/w/admin/teams", group: "people" },
  { key: "departments", label: "Departments", icon: "Building", href: "/w/admin/departments", group: "people" },
  { key: "roles", label: "Roles & Permissions", icon: "Key", href: "/w/admin/roles", group: "people" },
  { key: "consultants", label: "Consultants", icon: "Briefcase", href: "/w/admin/consultants", group: "talent" },
  { key: "resumes", label: "Resumes", icon: "FileText", href: "/w/admin/resumes", group: "talent" },
  { key: "assignments", label: "Marketing Assignments", icon: "Handshake", href: "/w/admin/marketing-assignments", group: "talent" },
  { key: "jobs", label: "Jobs", icon: "Target", href: "/w/admin/jobs", group: "pipeline" },
  { key: "applications", label: "Applications", icon: "Board", href: "/w/admin/applications", group: "pipeline" },
  { key: "interviews", label: "Interviews", icon: "CalendarCheck", href: "/w/admin/interviews", group: "pipeline" },
  { key: "clients", label: "Clients", icon: "Building", href: "/w/admin/clients", group: "pipeline" },
  { key: "placements", label: "Placements", icon: "Trophy", href: "/w/admin/placements", group: "pipeline" },
  { key: "subscription", label: "Subscription Overview", icon: "Layers", href: "/w/admin/subscription", group: "organization" },
  { key: "licenses", label: "Consultant Licenses", icon: "ShieldCheck", href: "/w/admin/licenses", group: "organization" },
  { key: "billing", label: "Billing", icon: "CreditCard", href: "/w/admin/billing", group: "organization" },
  { key: "usage", label: "Feature Usage", icon: "BarChart", href: "/w/admin/usage", group: "organization" },
  { key: "hr", label: "HR", icon: "Heart", href: "/w/admin/hr", group: "organization" },
  { key: "finance", label: "Finance", icon: "Dollar", href: "/w/admin/finance", group: "organization" },
  { key: "reports", label: "Reports", icon: "Chart", href: "/w/admin/reports", group: "organization" },
  { key: "branding", label: "Organization Branding", icon: "Sparkles", href: "/w/admin/branding", group: "organization" },
  { key: "domains", label: "Domains", icon: "Globe", href: "/w/admin/domains", group: "organization" },
  { key: "integrations", label: "Integrations", icon: "Webhook", href: "/w/admin/integrations", group: "organization" },
  { key: "audit", label: "Audit Logs", icon: "Shield", href: "/w/admin/audit", group: "organization" },
  { key: "settings", label: "Settings", icon: "Gear", href: "/w/admin/settings", group: "organization" },
  { key: "policies", label: "Policies", icon: "FileText", href: "/w/admin/policies", group: "organization" },
];

export interface ShellNavItem extends NavItem {
  /** True for a menu item the member's role or the organization's modules do not open yet: drawn greyed with a "Soon" chip. */
  soon?: boolean;
  /** The label in the organization's own words (terminology map applied). */
  text: string;
}

export interface NavSection {
  /** The group's key, or "main" for rows outside any group (Home, a trailing Settings). */
  id: string;
  /** The small label drawn above the group; null for rows outside any group. */
  label: string | null;
  items: ShellNavItem[];
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The organization's word for a menu entry. Terminology keys are the plural nouns of the allow-list (`employees`, `teams`,
 * `departments`, `consultants`, `clients`, `placements`, ...); an entry whose key is one of them takes the org's replacement.
 * Keys never change which page opens or who may open it.
 */
export function labelFor(item: Pick<NavItem, "key" | "label">, terminology: Record<string, string> | undefined | null): string {
  const t = terminology?.[item.key];
  return typeof t === "string" && t.trim() ? capital(t.trim()) : item.label;
}

const pathOf = (href: string) => href.split("#")[0].split("?")[0];
const queryOf = (href: string) => (href.includes("?") ? href.split("#")[0].split("?")[1] : "");

/**
 * The workspace's nav as display groups: consecutive items that share a `group` form one labelled section (Home and any item without a
 * group stand alone, unlabelled). The Administration home's own workspace also lists the pages its modules do not open yet, as "Soon".
 */
export function navSections(ws: Workspace, terminology?: Record<string, string> | null): NavSection[] {
  const decorate = (n: NavItem): ShellNavItem => ({ ...n, text: n.key === "home" ? homeLabel(ws) : labelFor(n, terminology) });
  const ordered: ShellNavItem[] = [];
  const full = ws.workspaceKey === "ADMIN" && ws.nav.some((n) => n.key === "home"); // the whole menu only on the Administration home's own workspace
  if (full) {
    const have = new Map(ws.nav.map((n) => [n.key, n]));
    for (const f of ADMIN_FULL) {
      const real = have.get(f.key);
      const d = decorate(real ? { ...real, group: real.group ?? f.group ?? null } : ({ key: f.key, label: f.label, icon: f.icon, href: f.href, group: f.group ?? null } as NavItem));
      // D9 (2026-10-16 audit): a page the API lists but nobody has built yet reads "Soon" exactly like one it does not list, so the menu never promises more than it opens
      if (!real || ADMIN_NOT_BUILT.has(f.key)) d.soon = true;
      ordered.push(d);
    }
    for (const n of ws.nav) if (!ADMIN_FULL.some((f) => f.key === n.key)) ordered.push(decorate(n));
  } else for (const n of ws.nav) ordered.push(decorate(n));

  const labels = new Map((ws.groups ?? []).map((g) => [g.key, g.label]));
  const labelOf = (key: string) => labels.get(key) ?? (ws.workspaceKey === "ADMIN" ? ADMIN_GROUP_LABELS[key] : undefined) ?? null;
  const sections: NavSection[] = [];
  for (const item of ordered) {
    const group = item.group && labelOf(item.group) ? item.group : null;
    const last = sections[sections.length - 1];
    if (last && group !== null && last.id === group) last.items.push(item);
    else if (last && group === null && last.label === null) last.items.push(item);
    else sections.push({ id: group ?? "main", label: group ? labelOf(group) : null, items: [item] });
  }
  return sections;
}

/**
 * Which item of `ws` is active for the current URL: the deepest page whose path the URL is at or under. Items that share a path
 * (Employees and Invitations, Teams and Departments) are told apart by the query string, else the one without a query wins.
 */
export function activeKey(ws: Workspace, pathname: string, search = ""): string | null {
  const here = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  let best: { key: string; len: number; q: number } | null = null;
  const consider = (key: string, href: string) => {
    const p = pathOf(href).replace(/\/+$/, "");
    if (!(here === p || (key !== "home" && here.startsWith(`${p}/`)))) return;
    const q = queryOf(href);
    let qScore = 0;
    if (q) {
      const want = new URLSearchParams(q);
      const matches = [...want.entries()].every(([k, v]) => params.get(k) === v);
      if (!matches) return;
      qScore = 1;
    }
    if (!best || p.length > best.len || (p.length === best.len && qScore > best.q)) best = { key, len: p.length, q: qScore };
  };
  for (const n of navSections(ws).flatMap((s) => s.items)) consider(n.key, n.href);
  return (best as { key: string } | null)?.key ?? null;
}

/** The title shown when a page has not supplied its own header: the active item's label, else the workspace's. */
export function defaultTitle(ws: Workspace, pathname: string, search: string, terminology?: Record<string, string> | null): string {
  const key = activeKey(ws, pathname, search);
  const all = navSections(ws, terminology).flatMap((s) => s.items);
  const hit = key ? all.find((i) => i.key === key) : undefined;
  if (hit) return hit.text;
  return ws.label;
}

/** The one that is "home" of a workspace calls itself Dashboard in the Administration menu (the board), "Home" elsewhere. */
export function homeLabel(ws: Workspace): string {
  return ws.workspaceKey === "ADMIN" ? "Dashboard" : "Home";
}

export interface SearchHit {
  key: string;
  label: string;
  workspace: string;
  href: string;
}

/**
 * The search box's results. Until the search API exists (people, applications, jobs, clients: a later story) the box only knows
 * the PAGES this member's menus list, across all of their workspaces. Prefix matches rank first, then word-prefix, then contains.
 */
export function searchPages(me: MeTenant, query: string, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const scored: { hit: SearchHit; score: number; order: number }[] = [];
  let order = 0;
  for (const ws of me.workspaces) {
    for (const item of navSections(ws, me.org.terminology).flatMap((s) => s.items).filter((i) => !i.soon)) {
      const text = item.text.trim();
      const hay = text.toLowerCase();
      let score = 0;
      if (q === "") score = 1;
      else if (hay.startsWith(q)) score = 4;
      else if (hay.split(/[\s&/]+/).some((w) => w.startsWith(q))) score = 3;
      else if (hay.includes(q)) score = 2;
      else if (ws.label.toLowerCase().includes(q)) score = 1;
      if (score === 0) continue;
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      scored.push({ hit: { key: `${ws.key}:${item.key}`, label: text, workspace: ws.label, href: item.href }, score, order: order++ });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((s) => s.hit);
}

export interface SwitcherRow {
  key: string;
  label: string;
  /** The roles that grant this workspace, in words ("Org Admin"). */
  roles: string;
  home: string;
  current: boolean;
  /** This is the one that opens first. */
  landing: boolean;
}

/** The switcher's rows (16 s4): label + the roles granting it, a check on the current one, a chip on the landing one. */
export function switcherRows(me: MeTenant, currentKey: string, preferredKey: string | null = null): SwitcherRow[] {
  const nameOf = (k: string) => me.roles.find((r) => r.key === k)?.name ?? k;
  const landingKey = preferredKey && me.workspaces.some((w) => w.key === preferredKey) ? preferredKey : (me.landingKey ?? me.workspaces[0]?.key ?? null);
  return me.workspaces.map((w) => ({
    key: w.key,
    label: w.label,
    roles: w.roleKeys.map(nameOf).join(", "),
    home: w.home,
    current: w.key === currentKey,
    landing: w.key === landingKey,
  }));
}

/** "Org Admin" - the member's primary role, for the user menu and the sidebar. */
export function primaryRoleName(me: MeTenant): string {
  return (me.roles.find((r) => r.isPrimary) ?? me.roles[0])?.name ?? "Member";
}

/**
 * The short form of the primary role for the profile chip ("Org Admin" on the boards, "Organization Admin" in the role's data).
 * A role may carry its own `shortName` (the API can add one later); until then the leading word "Organization" is abbreviated, so
 * no role name is hard-coded here and a custom role keeps its own name.
 */
export function primaryRoleShortName(me: MeTenant): string {
  const role = me.roles.find((r) => r.isPrimary) ?? me.roles[0];
  if (!role) return "Member";
  return role.shortName?.trim() || role.name.replace(/^Organization\b/, "Org");
}

/** The workspace the shell draws: the URL's, else the landing one (the not-part-of-your-role state fills the content area). */
export function shellWorkspace(me: MeTenant, slug: string): { ws: Workspace; allowed: boolean } | null {
  const found = me.workspaces.find((w) => w.key === slug);
  if (found) return { ws: found, allowed: true };
  const fallback = me.workspaces.find((w) => w.home === me.landing) ?? me.workspaces[0];
  return fallback ? { ws: fallback, allowed: false } : null;
}

/** The banner rules of 16 s2.1 that the session data can answer today (draft branding / domain failing need their own feeds). */
export function bannersFor(me: MeTenant, ws: Workspace, changed: boolean): { id: "access-changed" | "past-due"; href?: string }[] {
  const out: { id: "access-changed" | "past-due"; href?: string }[] = [];
  if (changed) out.push({ id: "access-changed" });
  if (me.org.flags.pastDue && Object.prototype.hasOwnProperty.call(me.permissions, "billing.view")) {
    const billing = ws.nav.find((n) => n.key === "billing") ?? me.workspaces.flatMap((w) => w.nav).find((n) => n.key === "billing");
    out.push({ id: "past-due", href: billing?.href });
  }
  return out;
}

/** Quick links of the help panel (no AI backend yet: the panel says so). */
export function helpLinks(supportEmail: string | null | undefined): { label: string; href: string; external?: boolean }[] {
  const links: { label: string; href: string; external?: boolean }[] = [];
  if (supportEmail) links.push({ label: `Email ${supportEmail}`, href: `mailto:${supportEmail}`, external: true });
  // The organization's own pages on THIS host (docs/enterprise-v2/62): a member of an enterprise account never lands on a Kiwiply page.
  links.push({ label: "Support and contact", href: "/support" });
  links.push({ label: "Privacy policy", href: "/privacy" });
  links.push({ label: "Terms of use", href: "/terms" });
  return links;
}

/**
 * What the catch-all route (a menu page nobody has built yet) shows for `/w/{workspace}/{slug...}`:
 * a page the member's menu lists (or sits under one) -> "page" with its label; anything else -> "denied" ("This isn't part of your role").
 */
export function catchAllPage(me: MeTenant, workspace: string, slug: string[]): { kind: "page"; title: string } | { kind: "denied" } {
  const ws = me.workspaces.find((w) => w.key === workspace);
  if (!ws) return { kind: "denied" };
  const path = `/w/${workspace}${slug.length ? `/${slug.join("/")}` : ""}`.replace(/\/+$/, "");
  const flat = navSections(ws, me.org.terminology).flatMap((s) => s.items);
  let best: ShellNavItem | null = null;
  for (const item of flat) {
    const p = pathOf(item.href).replace(/\/+$/, "");
    const hit = path === p || (item.key !== "home" && path.startsWith(`${p}/`));
    if (hit && (!best || p.length > pathOf(best.href).length)) best = item;
  }
  if (!best) return { kind: "denied" };
  return { kind: "page", title: best.text };
}
