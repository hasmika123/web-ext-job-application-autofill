/**
 * Pure helpers behind the tenant shell (X2.16; docs/enterprise-v2/16 s2-s4). No React, no Next: everything the sidebar, the
 * search box, the switcher and the page header decide is a function of the X2.2 session (`MeTenant`), so it is table-testable.
 *
 * The menu itself is DATA the API already filtered by the member's permissions and the organization's modules
 * (`GET /api/me/tenant`, X2.2): this file only GROUPS it for display, labels it with the organization's own words and answers
 * "which item is active". It never adds an item and never greys one out: a page the member cannot open is simply absent.
 */
import type { MeTenant, NavItem, Workspace } from "@/lib/ent/workspaces";

/** Where each Administration item sits in the board's three groups (people and operations | plan and money | organization). */
const ADMIN_GROUP: Record<string, number> = {
  home: 0, employees: 0, invitations: 0, teams: 0, departments: 0, roles: 0, consultants: 0, resumes: 0, assignments: 0, jobs: 0,
  applications: 0, interviews: 0, clients: 0, placements: 0,
  subscription: 1, licenses: 1, billing: 1, usage: 1, hr: 1, finance: 1, reports: 1,
  branding: 2, domains: 2, integrations: 2, audit: 2, settings: 2, policies: 2,
};

/** The two expandable Administration rows (HR, Finance): their pages under `/w/admin/<key>/...` (gated by the parent's permission). */
const ADMIN_CHILDREN: Record<string, { key: string; label: string; slug: string }[]> = {
  hr: [
    { key: "hr-onboarding", label: "Onboarding", slug: "onboarding" },
    { key: "hr-documents", label: "Documents", slug: "documents" },
    { key: "hr-compliance", label: "Compliance", slug: "compliance" },
  ],
  finance: [
    { key: "finance-invoices", label: "Invoices", slug: "invoices" },
    { key: "finance-payments", label: "Payments", slug: "payments" },
    { key: "finance-timesheets", label: "Timesheets", slug: "timesheets" },
  ],
};

/**
 * Administration pages whose route is still the "on the way" placeholder, whether or not the API lists them for this member. Take a key out of this
 * set in the same change that builds its page (the sidebar test fails if one is both built and listed here).
 */
export const ADMIN_NOT_BUILT: ReadonlySet<string> = new Set(["subscription", "licenses", "billing", "usage", "hr", "finance", "domains", "integrations"]);

/**
 * The whole Administration menu in the board's order (design/enterprise-talent/dashboard.png). The API sends only the items a member
 * may open with their modules on; the others are shown too, greyed with a "Soon" chip and leading to the honest "on the way" page,
 * so the menu always reads as the full product. Everything the API does send wins over this list (its href, label, icon).
 */
const ADMIN_FULL: { key: string; label: string; icon: string; href: string }[] = [
  { key: "home", label: "Dashboard", icon: "Home", href: "/w/admin" },
  { key: "employees", label: "Employees", icon: "Users", href: "/w/admin/employees" },
  { key: "invitations", label: "Invitations", icon: "Mail", href: "/w/admin/invitations" },
  { key: "teams", label: "Teams", icon: "Network", href: "/w/admin/teams" },
  { key: "departments", label: "Departments", icon: "Building", href: "/w/admin/departments" },
  { key: "roles", label: "Roles & Permissions", icon: "Key", href: "/w/admin/roles" },
  { key: "consultants", label: "Consultants", icon: "Briefcase", href: "/w/admin/consultants" },
  { key: "resumes", label: "Resumes", icon: "FileText", href: "/w/admin/resumes" },
  { key: "assignments", label: "Marketing Assignments", icon: "Handshake", href: "/w/admin/marketing-assignments" },
  { key: "jobs", label: "Jobs", icon: "Target", href: "/w/admin/jobs" },
  { key: "applications", label: "Applications", icon: "Board", href: "/w/admin/applications" },
  { key: "interviews", label: "Interviews", icon: "CalendarCheck", href: "/w/admin/interviews" },
  { key: "clients", label: "Clients", icon: "Building", href: "/w/admin/clients" },
  { key: "placements", label: "Placements", icon: "Trophy", href: "/w/admin/placements" },
  { key: "subscription", label: "Subscription Overview", icon: "Layers", href: "/w/admin/subscription" },
  { key: "licenses", label: "Consultant Licenses", icon: "ShieldCheck", href: "/w/admin/licenses" },
  { key: "billing", label: "Billing", icon: "CreditCard", href: "/w/admin/billing" },
  { key: "usage", label: "Feature Usage", icon: "BarChart", href: "/w/admin/usage" },
  { key: "hr", label: "HR", icon: "Heart", href: "/w/admin/hr" },
  { key: "finance", label: "Finance", icon: "Dollar", href: "/w/admin/finance" },
  { key: "reports", label: "Reports", icon: "Chart", href: "/w/admin/reports" },
  { key: "branding", label: "Organization Branding", icon: "Sparkles", href: "/w/admin/branding" },
  { key: "domains", label: "Domains", icon: "Globe", href: "/w/admin/domains" },
  { key: "integrations", label: "Integrations", icon: "Webhook", href: "/w/admin/integrations" },
  { key: "audit", label: "Audit Logs", icon: "Shield", href: "/w/admin/audit" },
  { key: "settings", label: "Settings", icon: "Gear", href: "/w/admin/settings" },
  { key: "policies", label: "Policies", icon: "FileText", href: "/w/admin/policies" },
];

export interface ShellNavItem extends NavItem {
  /** True for a menu item the member's role or the organization's modules do not open yet: drawn greyed with a "Soon" chip. */
  soon?: boolean;
  /** The label in the organization's own words (terminology map applied). */
  text: string;
  children?: ShellNavItem[];
}

export interface NavSection {
  id: string;
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

/** The workspace's nav as display groups. Administration uses the board's three groups; every other workspace is one group. */
export function navSections(ws: Workspace, terminology?: Record<string, string> | null): NavSection[] {
  const decorate = (n: NavItem): ShellNavItem => {
    const base: ShellNavItem = { ...n, text: n.key === "home" ? homeLabel(ws) : labelFor(n, terminology) };
    const kids = ws.workspaceKey === "ADMIN" ? ADMIN_CHILDREN[n.key] : undefined;
    if (kids) {
      base.children = [
        { key: `${n.key}-overview`, label: "Overview", text: "Overview", icon: n.icon, href: n.href },
        ...kids.map((k) => ({ key: k.key, label: k.label, text: k.label, icon: n.icon, href: `${n.href}/${k.slug}` })),
      ];
    }
    return base;
  };
  if (ws.workspaceKey !== "ADMIN") return [{ id: "main", items: ws.nav.map(decorate) }];
  const groups: NavSection[] = [{ id: "people", items: [] }, { id: "plan", items: [] }, { id: "organization", items: [] }];
  const have = new Map(ws.nav.map((n) => [n.key, n]));
  const full = ws.nav.some((n) => n.key === "home"); // the whole menu only on the Administration home's own workspace
  const ordered: { item: NavItem; soon: boolean }[] = [];
  if (full) {
    for (const f of ADMIN_FULL) {
      const real = have.get(f.key);
      ordered.push(real ? { item: real, soon: false } : { item: { key: f.key, label: f.label, icon: f.icon, href: f.href } as NavItem, soon: true });
    }
    for (const n of ws.nav) if (!ADMIN_FULL.some((f) => f.key === n.key)) ordered.push({ item: n, soon: false });
  } else for (const n of ws.nav) ordered.push({ item: n, soon: false });
  for (const { item, soon: missing } of ordered) {
    const d = decorate(item);
    // D9 (2026-10-16 audit): a page the API lists but nobody has built yet reads "Soon" exactly like one it does not list, so the menu never promises more than it opens
    const soon = missing || ADMIN_NOT_BUILT.has(item.key);
    if (soon) {
      d.soon = true;
      delete d.children;
    }
    groups[ADMIN_GROUP[item.key] ?? 0].items.push(d);
  }
  return groups.filter((g) => g.items.length > 0);
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
  for (const n of navSections(ws).flatMap((s) => s.items)) {
    consider(n.key, n.href);
    for (const c of n.children ?? []) if (c.key !== `${n.key}-overview`) consider(c.key, c.href);
  }
  return (best as { key: string } | null)?.key ?? null;
}

/** The title shown when a page has not supplied its own header: the active item's label, else the workspace's. */
export function defaultTitle(ws: Workspace, pathname: string, search: string, terminology?: Record<string, string> | null): string {
  const key = activeKey(ws, pathname, search);
  const all = navSections(ws, terminology).flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])]));
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
  const items = navSections(ws, me.org.terminology).flatMap((s) => s.items);
  const flat = items.flatMap((i) => [...(i.children ?? []).filter((c) => c.key !== `${i.key}-overview`), i]);
  let best: ShellNavItem | null = null;
  for (const item of flat) {
    const p = pathOf(item.href).replace(/\/+$/, "");
    const hit = path === p || (item.key !== "home" && path.startsWith(`${p}/`));
    if (hit && (!best || p.length > pathOf(best.href).length)) best = item;
  }
  if (!best) return { kind: "denied" };
  return { kind: "page", title: best.text };
}
