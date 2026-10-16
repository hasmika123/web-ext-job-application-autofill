import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The link audit of docs/enterprise-v2/62 section 5, as a test: a page a member of an enterprise account sees must never send them to a Kiwiply page
 * (the portal shows the organization's branding). It scans the code that renders on a tenant host and fails on
 *   - a hard-coded `kiwiply.com` address, and
 *   - a link, push, redirect or fetch literal that names a route that exists only on the platform site (`/pricing`, `/billing`, `/dashboard`,
 *     `/settings`, `/profile`, `/resume-builder`, `/connect`, ...).
 * `/privacy`, `/terms`, `/support` and `/acceptable-use` are NOT platform-only: on a tenant host the proxy serves the organization's own policy pages there.
 * Anything intentionally platform-side must be listed in ALLOWED with the reason; the list is short on purpose.
 */
const SRC = resolve(__dirname, "../..");

/** Code that renders on a tenant host (pages, shell, workspaces, BFF routes of the org API, tenant libs). */
const ROOTS = [
  "components/ent",
  "components/tenant",
  "lib/ent",
  "app/(tenant)",
  "app/api/orgs",
  "lib/tenant-policies.ts",
  "lib/tenant.ts",
  "lib/tenant-urls.ts",
  "lib/tenant-host.ts",
  "lib/tenant-metadata.ts",
];

/** Platform-only routes (marketing, the personal app, admin). */
const PLATFORM_ROUTE = /["'`]\/(pricing|help|contact|billing|dashboard|settings|profile|resume-builder|org|admin|board|connect|signup|register|account|resumes|profiles|jobs|applications|dossier)(["'`/?#])/;
const KIWIPLY_URL = /kiwiply\.com/i;

/** file (relative to src) + the exact text that is allowed there, with the reason. */
const ALLOWED: { file: string; text: string; why: string }[] = [
  { file: "lib/tenant-host.ts", text: "/account/activate", why: "a tenant route: the account-activation page is served on the tenant host" },
  { file: "lib/ent/consultant-ws/profile.ts", text: '"/contact', why: "the org API sub-path for the consultant's contact details, not a page" },
  { file: "app/api/orgs/[orgId]/me-workspace/profile/contact/route.ts", text: '"/contact"', why: "the same org API sub-path in its BFF route, not a page" },
];

function walk(path: string, out: string[] = []): string[] {
  if (statSync(path).isFile()) return /\.(ts|tsx)$/.test(path) && !/\.(test|stories)\./.test(path) ? [...out, path] : out;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|stories)\./.test(entry.name)) out.push(p);
  }
  return out;
}

/** The source without comments (a comment may say "kiwiply.com"; code may not). */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
}

function offenders(files: string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const rel = relative(SRC, f).replace(/\\/g, "/");
    code(readFileSync(f, "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (!pattern.test(line)) return;
        if (ALLOWED.some((a) => a.file === rel && line.includes(a.text))) return;
        hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
      });
  }
  return hits;
}

const tenantFiles = ROOTS.flatMap((r) => walk(join(SRC, r)));

describe("tenant link audit", () => {
  it("scans a meaningful set of files", () => {
    expect(tenantFiles.length).toBeGreaterThan(150);
  });

  it("no tenant code hard-codes a kiwiply.com address", () => {
    expect(offenders(tenantFiles, KIWIPLY_URL)).toEqual([]);
  });

  it("no tenant code links to a platform-only route", () => {
    expect(offenders(tenantFiles, PLATFORM_ROUTE)).toEqual([]);
  });

  it("the allow-list stays short and every entry still matches something", () => {
    expect(ALLOWED.length).toBeLessThanOrEqual(3);
    for (const a of ALLOWED) {
      expect(readFileSync(join(SRC, a.file), "utf8")).toContain(a.text);
      expect(a.why.length).toBeGreaterThan(10);
    }
  });
});

describe("shared components a workspace renders", () => {
  const builder = walk(join(SRC, "components/app-v3/resume-builder")).filter((f) => !f.endsWith("builderEnv.tsx"));

  it("the Resume Builder never hard-codes the pricing page (its environment decides; none in an organization)", () => {
    const hits = offenders(builder, /["'`]\/pricing["'`]/);
    expect(hits).toEqual([]);
  });

  it("the Resume Builder's personal-only 'Change sharing' link is hidden inside an organization", () => {
    for (const f of builder) {
      const text = code(readFileSync(f, "utf8"));
      let at = text.indexOf("/settings/organizations");
      while (at !== -1) {
        expect(text.slice(Math.max(0, at - 260), at), `${relative(SRC, f)} links /settings/organizations outside a personal-only condition`).toMatch(/env\.kind === "personal"/);
        at = text.indexOf("/settings/organizations", at + 1);
      }
    }
  });

  it("the inbox guide in the consultant workspace passes its own host's links and wording", () => {
    const page = readFileSync(join(SRC, "components/ent/consultant-ws/InboxPage.tsx"), "utf8");
    expect(page).toContain("links={TENANT_INBOX_LINKS}");
    expect(page).toMatch(/privacy: "\/privacy"/);
    expect(code(page)).not.toMatch(/Kiwiply/);
  });

  it("the shell's help links are the organization's own pages", async () => {
    const { helpLinks } = await import("@/lib/ent/shell");
    const links = helpLinks("it@acme.example");
    expect(links.map((l) => l.href)).toEqual(["mailto:it@acme.example", "/support", "/privacy", "/terms"]);
    expect(links.some((l) => /kiwiply/i.test(l.href + l.label))).toBe(false);
  });
});
