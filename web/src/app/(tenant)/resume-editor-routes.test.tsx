// @vitest-environment node
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meTenantFor as untyped } from "../../../scripts/mock-me-tenant.mjs";
import { parseMeTenant } from "@/lib/ent/tenant-session-core";
import { envFromSpec } from "@/components/app-v3/resume-builder/builderEnv";

/**
 * D1 (2026-10-16 audit): the tenant Resume Builder routes are SERVER components. They crashed in the browser ("Error in the Server Components render")
 * because they handed a client component an object holding a function (`BuilderEnv.editorHref`). A function cannot cross the server/client boundary, and
 * nothing in jsdom notices. This walks what each route returns and fails on any prop that is not plain data, so the same mistake cannot come back.
 */
const state = vi.hoisted(() => ({ session: { kind: "UNAUTHENTICATED" } as unknown }));
vi.mock("@/lib/ent/tenant-session", async (orig) => ({ ...(await orig<typeof import("@/lib/ent/tenant-session")>()), getTenantSession: async () => state.session }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/api", () => ({
  serverApiFetch: async () => new Response(JSON.stringify({ row: { resumeId: 42 } }), { status: 200 }),
}));
vi.mock("@/lib/resume-editor-data", () => ({
  editorTitle: async () => "Resume",
  loadEditorData: async () => ({
    kind: "ok",
    initial: { doc: { sections: [] }, docVersion: 3, label: "Resume" },
    plan: "FREE",
    config: { capabilities: { mode: "consultant" } },
    aiUsageLine: null,
    profileUpdatedAt: null,
    initialMeta: null,
    primaryResumeId: null,
  }),
}));

import ConsultantEditorRoute from "./%5Ft/w/consultant/resumes/[id]/page";
import MarketerEditorRoute from "./%5Ft/w/[workspace]/resumes/[orgResumeId]/page";

const meTenantFor = untyped as (host: string, login: string) => { body: unknown; etag: string } | null;
const signedIn = (login: string) => {
  const a = meTenantFor("acme.localhost", login)!;
  return { kind: "OK", me: parseMeTenant(a.body)!, etag: a.etag };
};

/** Every prop that is not `children` must survive the RSC payload: plain objects/arrays/strings/numbers/booleans/null, no functions or class instances. */
function nonSerialisable(node: unknown, path = "props"): string[] {
  if (node === null || node === undefined) return [];
  const t = typeof node;
  if (t === "string" || t === "number" || t === "boolean") return [];
  if (t === "function" || t === "symbol" || t === "bigint") return [`${path} is a ${t}`];
  if (Array.isArray(node)) return node.flatMap((v, i) => nonSerialisable(v, `${path}[${i}]`));
  if (t === "object") {
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) return [`${path} is a ${proto?.constructor?.name ?? "class"} instance`];
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => nonSerialisable(v, `${path}.${k}`));
  }
  return [];
}

function walk(node: ReactNode, out: string[] = [], path = "root"): string[] {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, out, `${path}[${i}]`));
    return out;
  }
  if (!isValidElement(node)) return out;
  const { children, ...rest } = node.props as { children?: ReactNode } & Record<string, unknown>;
  const name = typeof node.type === "string" ? node.type : ((node.type as { name?: string }).name ?? "Component");
  out.push(...nonSerialisable(rest, `${path}<${name}>`));
  walk(children, out, `${path}<${name}>`);
  return out;
}

beforeEach(() => {
  state.session = { kind: "UNAUTHENTICATED" };
});

describe("the tenant Resume Builder routes only hand plain data to client components (D1)", () => {
  it("/w/consultant/resumes/[id]", async () => {
    state.session = signedIn("consultant@acme.com");
    const tree = await ConsultantEditorRoute({ params: Promise.resolve({ id: "7" }) });
    expect(tree).toBeTruthy();
    expect(walk(tree as ReactNode)).toEqual([]);
  });

  it("/w/marketing/resumes/[orgResumeId] (act-for)", async () => {
    state.session = signedIn("marketer@acme.com");
    const tree = await MarketerEditorRoute({ params: Promise.resolve({ workspace: "marketing", orgResumeId: "5" }) });
    expect(tree).toBeTruthy();
    expect(walk(tree as ReactNode)).toEqual([]);
  });

  it("the walker does catch a function prop (it would have failed before the fix)", () => {
    const bad = <div data-x={undefined}>{[<span key="a" {...({ env: { editorHref: () => "/x" } } as object)} />]}</div>;
    expect(walk(bad).join()).toContain("is a function");
  });
});

describe("envFromSpec builds the very same envs the client used to receive", () => {
  it("consultant", () => {
    const env = envFromSpec({ mode: "consultant", orgId: 2 });
    expect(env.kind).toBe("org");
    expect(env.editorHref(9)).toBe("/w/consultant/resumes/9");
  });
  it("act-for editor", () => {
    const env = envFromSpec({ mode: "actForEditor", orgResumeId: 5, resumeId: 42 });
    expect(env.kind).toBe("actFor");
    expect(env.actForRow).toBe(5);
    expect(env.actForResumeId).toBe(42);
  });
});
