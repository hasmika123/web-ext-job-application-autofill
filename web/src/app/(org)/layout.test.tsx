// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** O1.6: the four branches of the console gate (APP-E2E-PLAN 2.2), plus the flag, the session and an API failure. */

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const hasSession = vi.fn<() => Promise<boolean>>();
const getPublicConfig = vi.fn<() => Promise<{ orgs: boolean; demo: boolean }>>();
let cookieValue: string | undefined;

vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/auth", () => ({ hasSession: () => hasSession() }));
vi.mock("@/lib/public-config", () => ({ getPublicConfig: () => getPublicConfig() }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "kiwiply_org" && cookieValue ? { name, value: cookieValue } : undefined) }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/org-v2/shell/org-fonts", () => ({ ORG_THEME_CLASS: "theme-v2" }));
vi.mock("@/components/org-v2/shell/OrgLoadError", () => ({ default: () => "load-error" }));
vi.mock("@/components/org-v2/shell/OrgShell", () => ({ default: () => "shell" }));

import OrgGroupLayout from "./layout";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mine = (...rows: Array<{ orgId: number; name: string; role: string; status?: string }>) =>
  rows.map((r) => ({ slug: r.name.toLowerCase().replace(/\s+/g, "-"), status: "ACTIVE", memberCount: 3, ...r }));

const detail = (orgId: number, name: string, role: string, permissions: string[]) => ({
  org: { id: orgId, slug: name.toLowerCase(), name, type: "BOOTCAMP", status: "ACTIVE", timezone: "UTC" },
  me: { memberId: 9, role, permissions },
  memberCount: 3,
  status: "ACTIVE",
});

/** Wires the API: the account probe, the memberships and each org's detail. */
function api(opts: { account?: number; mine?: Response | unknown[]; details?: Record<number, unknown> }) {
  serverApiFetch.mockImplementation(async (path) => {
    if (path === "/api/account") return json({ login: "sam", firstName: "Sam" }, opts.account ?? 200);
    if (path === "/api/orgs/mine") return opts.mine instanceof Response ? opts.mine : json(opts.mine ?? []);
    const m = /^\/api\/orgs\/(\d+)$/.exec(path);
    if (m && opts.details?.[Number(m[1])]) return json(opts.details[Number(m[1])]);
    return json({ status: 404 }, 404);
  });
}

async function run() {
  try {
    const out = await OrgGroupLayout({ children: "page" });
    return { redirect: null as string | null, out };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("REDIRECT:")) return { redirect: msg.slice("REDIRECT:".length), out: null };
    throw e;
  }
}

/** The props the layout gave `OrgShell` (the element's props, since OrgShell is mocked). */
function shellProps(out: unknown) {
  const frame = out as { props: { children: { props: Record<string, unknown> } } };
  return frame.props.children.props as { current: { org: { id: number; name: string }; role: string; permissions: string[] }; orgs: Array<{ orgId: number }> };
}

beforeEach(() => {
  hasSession.mockResolvedValue(true);
  getPublicConfig.mockResolvedValue({ orgs: true, demo: false });
  cookieValue = undefined;
});
afterEach(() => {
  serverApiFetch.mockReset();
  hasSession.mockReset();
  getPublicConfig.mockReset();
});

describe("(org)/layout: the console gate", () => {
  it("no session cookie -> /login", async () => {
    hasSession.mockResolvedValue(false);
    expect((await run()).redirect).toBe("/login");
  });

  it("a rejected token -> /login", async () => {
    api({ account: 401 });
    expect((await run()).redirect).toBe("/login");
  });

  it("the org flag off -> /dashboard, and the memberships are never asked for", async () => {
    getPublicConfig.mockResolvedValue({ orgs: false, demo: false });
    api({ mine: mine({ orgId: 1, name: "Acme", role: "OWNER" }) });
    expect((await run()).redirect).toBe("/dashboard");
    expect(serverApiFetch.mock.calls.map((c) => c[0])).not.toContain("/api/orgs/mine");
  });

  it("zero memberships -> /org/new", async () => {
    api({ mine: [] });
    expect((await run()).redirect).toBe("/org/new");
  });

  it("MEMBER-only -> /dashboard with the explanation toast", async () => {
    api({ mine: mine({ orgId: 1, name: "Acme", role: "MEMBER" }, { orgId: 2, name: "Beta", role: "MEMBER" }) });
    expect((await run()).redirect).toBe("/dashboard?toast=org_member");
  });

  it("one admin-ish membership renders the shell with {org, role, permissions}", async () => {
    api({
      mine: mine({ orgId: 7, name: "Acme", role: "ADMIN" }),
      details: { 7: detail(7, "Acme", "ADMIN", ["billing.view", "members.invite"]) },
    });
    const { redirect, out } = await run();
    expect(redirect).toBeNull();
    const props = shellProps(out);
    expect(props.current.org.id).toBe(7);
    expect(props.current.role).toBe("ADMIN");
    expect(props.current.permissions).toEqual(["billing.view", "members.invite"]);
    expect(props.orgs.map((o) => o.orgId)).toEqual([7]);
  });

  it("a plain MEMBER seat next to an admin seat is not in the switcher", async () => {
    api({
      mine: mine({ orgId: 1, name: "Beta", role: "MEMBER" }, { orgId: 7, name: "Acme", role: "STAFF" }),
      details: { 7: detail(7, "Acme", "STAFF", ["reports.view"]) },
    });
    const props = shellProps((await run()).out);
    expect(props.orgs.map((o) => o.orgId)).toEqual([7]);
  });

  it("several memberships: the kiwiply_org cookie picks one", async () => {
    cookieValue = "8";
    api({
      mine: mine({ orgId: 7, name: "Acme", role: "OWNER" }, { orgId: 8, name: "Beta", role: "ADMIN" }),
      details: { 7: detail(7, "Acme", "OWNER", ["org.close"]), 8: detail(8, "Beta", "ADMIN", ["billing.view"]) },
    });
    const props = shellProps((await run()).out);
    expect(props.current.org.id).toBe(8);
    expect(props.current.role).toBe("ADMIN");
    expect(props.orgs.map((o) => o.orgId)).toEqual([7, 8]);
  });

  it("a stale or forged cookie falls back to the first org the person administers", async () => {
    cookieValue = "999";
    api({
      mine: mine({ orgId: 7, name: "Acme", role: "OWNER" }, { orgId: 8, name: "Beta", role: "ADMIN" }),
      details: { 7: detail(7, "Acme", "OWNER", ["org.close"]) },
    });
    expect(shellProps((await run()).out).current.org.id).toBe(7);
    cookieValue = "not-a-number";
    expect(shellProps((await run()).out).current.org.id).toBe(7);
  });

  it("an API failure shows a retry, not a redirect", async () => {
    api({ mine: json({ status: 500 }, 500) });
    const { redirect, out } = await run();
    expect(redirect).toBeNull();
    expect(JSON.stringify(out)).not.toContain("shell");
  });

  it("a 404 from the memberships call (the flag flipped since the web last asked) -> /dashboard", async () => {
    api({ mine: json({ status: 404 }, 404) });
    expect((await run()).redirect).toBe("/dashboard");
  });
});
