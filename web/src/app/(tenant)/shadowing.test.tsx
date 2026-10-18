// @vitest-environment node
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meTenantFor as untyped } from "../../../scripts/mock-me-tenant.mjs";
import { parseMeTenant } from "@/lib/ent/tenant-session-core";
import { ComingSoon } from "@/components/ent/shell/ShellStates";
import JobDiscoveryPage from "@/components/ent/marketer-ws/jobs/JobDiscoveryPage";
import MktApplicationsPage from "@/components/ent/marketer-ws/applications/ApplicationsPage";
import MktInterviewsPage from "@/components/ent/marketer-ws/interviews/InterviewsPage";
import MktResumesPage from "@/components/ent/marketer-ws/resumes/ResumesPage";
import MktSubmissionsPage from "@/components/ent/marketer-ws/submissions/SubmissionsPage";
import AdminApplicationsPage from "@/components/ent/applications/ApplicationsPage";
import AdminInterviewsPage from "@/components/ent/interviews/InterviewsPage";
import AdminResumesPage from "@/components/ent/resumes/ResumesPage";
import AdminJobsPage from "@/components/ent/jobs/JobsPage";
import SubmissionsRecordsPage from "@/components/ent/accounts-submissions/SubmissionsRecordsPage";

/**
 * D5 (2026-10-16 audit): `/w/marketing/jobs` answered "This page is on the way" because the explicit `[workspace]/jobs/page.tsx` shadows the catch-all and
 * returned ComingSoon for every workspace but admin, so the Marketing workspace's own page never mounted. An explicit folder under `[workspace]/` wins over
 * the catch-all, so a page that exists for the Marketing workspace must be reachable THROUGH it. This renders what every Marketing menu item resolves to (the
 * explicit folder when there is one, the catch-all otherwise) and fails on "on the way" for any page the Marketing registry builds.
 */
const state = vi.hoisted(() => ({ session: { kind: "UNAUTHENTICATED" } as unknown }));
vi.mock("@/lib/tenant", () => ({ getTenant: async () => ({ kind: "TENANT", tenant: { kind: "TENANT", displayName: "Acme", branding: {} } }) }));
vi.mock("@/lib/ent/tenant-session", async (orig) => ({ ...(await orig<typeof import("@/lib/ent/tenant-session")>()), getTenantSession: async () => state.session }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/w/marketing",
  useSearchParams: () => new URLSearchParams(),
}));

import WorkspaceCatchAll from "./%5Ft/w/[workspace]/[[...slug]]/page";

const meTenantFor = untyped as (host: string, login: string) => { body: unknown; etag: string } | null;
const ok = (login: string) => {
  const a = meTenantFor("acme.localhost", login)!;
  return { kind: "OK", me: parseMeTenant(a.body)!, etag: a.etag };
};

const W_DIR = resolve(__dirname, "%5Ft/w/[workspace]");
const explicit = readdirSync(W_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("[")).map((d) => d.name);

/** Whether a React element tree contains an element of this type (walks nested children, not into component internals). */
function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((n) => contains(n, type));
  if (!isValidElement(node)) return false;
  const el = node as ReactElement<{ children?: ReactNode }>;
  return el.type === type || contains(el.props.children, type);
}

async function resolvePage(workspace: string, segment: string): Promise<ReactNode> {
  const params = Promise.resolve({ workspace, slug: [segment] });
  if (explicit.includes(segment)) {
    const mod = (await import(/* @vite-ignore */ `./%5Ft/w/[workspace]/${segment}/page`)) as { default: (p: { params: Promise<{ workspace: string; slug?: string[] }>; searchParams?: Promise<Record<string, string>> }) => Promise<ReactNode>;};
    return mod.default({ params, searchParams: Promise.resolve({}) });
  }
  return WorkspaceCatchAll({ params });
}

beforeEach(() => {
  state.session = ok("marketer@acme.com");
});

describe("an explicit [workspace]/<page> folder does not hide a Marketing page behind 'on the way' (D5)", () => {
  it("/w/marketing/jobs mounts Job Discovery", async () => {
    const tree = await resolvePage("marketing", "jobs");
    expect(contains(tree, ComingSoon)).toBe(false);
    expect(contains(tree, JobDiscoveryPage)).toBe(true);
  });

  // The first fix (D5) only asserted "not on the way": /w/marketing/{applications,interviews,resumes} rendered the ADMINISTRATION pages instead of the marketer ones.
  // Each explicit folder must hand the Marketing workspace ITS component and keep serving its own to the workspace it was written for.
  const shadowed: [string, unknown, unknown][] = [
    ["jobs", JobDiscoveryPage, AdminJobsPage],
    ["applications", MktApplicationsPage, AdminApplicationsPage],
    ["interviews", MktInterviewsPage, AdminInterviewsPage],
    ["resumes", MktResumesPage, AdminResumesPage],
    ["submissions", MktSubmissionsPage, SubmissionsRecordsPage],
  ];

  it.each(shadowed)("/w/marketing/%s mounts the marketer page and not the Administration one", async (segment, marketerPage, adminPage) => {
    expect(explicit).toContain(segment); // the folder really shadows the catch-all, so this test is about the folder's own route
    const tree = await resolvePage("marketing", segment);
    expect(contains(tree, ComingSoon)).toBe(false);
    expect(contains(tree, marketerPage)).toBe(true);
    expect(contains(tree, adminPage)).toBe(false);
  });

  it.each(shadowed)("/w/admin/%s still mounts the Administration page (the folder keeps serving its own workspace)", async (segment, marketerPage, adminPage) => {
    state.session = ok("owner@acme.com");
    const tree = await resolvePage("admin", segment);
    expect(contains(tree, adminPage)).toBe(true);
    expect(contains(tree, marketerPage)).toBe(false);
  });

  it("a marketer asking for a Marketing page their menu does not list gets 'not part of your role', never the Administration page", async () => {
    // the consultant has no Marketing workspace at all: catchAllPage is "denied" for it
    state.session = ok("consultant@acme.com");
    for (const [segment, , adminPage] of shadowed) {
      const tree = await resolvePage("marketing", segment);
      expect(contains(tree, adminPage)).toBe(false);
    }
  });

  it("every item of the Marketing menu renders a real page, whichever route owns it", async () => {
    const me = (state.session as { me: { workspaces: { key: string; nav: { key: string; href: string }[] }[] } }).me;
    const nav = me.workspaces.find((w) => w.key === "marketing")!.nav;
    expect(nav.length).toBeGreaterThan(5);
    const onTheWay: string[] = [];
    for (const item of nav) {
      const segment = item.href.replace(/^\/w\/marketing\/?/, "").split("/")[0];
      if (!segment) continue; // the workspace home is the catch-all with no slug (tested elsewhere)
      const tree = await resolvePage("marketing", segment);
      if (tree === null || contains(tree, ComingSoon)) onTheWay.push(item.href);
    }
    expect(onTheWay).toEqual([]);
  });
});
