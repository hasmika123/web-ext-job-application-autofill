import { describe, expect, it, vi, beforeEach } from "vitest";

const notFound = vi.fn((): never => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((to: string): never => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }));
const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (p: string, i?: RequestInit) => serverApiFetch(p, i) }));
vi.mock("@/lib/ai-usage", () => ({ getAiUsage: async () => null, describeAiUsage: () => null }));
vi.mock("@/lib/billing", () => ({ getPlan: async () => ({ plan: "FREE" }) }));
vi.mock("@/lib/resume-builder-config", () => ({ getBuilderConfig: async () => ({}) }));
vi.mock("@/components/app-v3/resume-builder/ResumeEditor", () => ({ default: () => null }));

import Page from "./page";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/resume-builder/[id] page", () => {
  it("converts an uploaded resume on open, then renders the editor", async () => {
    let imported = false;
    serverApiFetch.mockImplementation(async (path, init) => {
      if (path.endsWith("/doc/import") && init?.method === "POST") {
        imported = true;
        return json({}, 200);
      }
      if (path.endsWith("/doc")) return imported ? json({ docVersion: 1, label: "Uploaded" }, 200, { etag: '"1"' }) : json({}, 404);
      return json({}, 404);
    });
    const el = (await Page(props("42"))) as unknown as { props: { initial: { docVersion: number } } };
    expect(imported).toBe(true);
    expect(el.props.initial.docVersion).toBe(1);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("stays a 404 when the resume is not the caller's (the conversion is refused too)", async () => {
    serverApiFetch.mockImplementation(async () => json({}, 404));
    await expect(Page(props("43"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("a built resume loads without any conversion call", async () => {
    serverApiFetch.mockImplementation(async (path) => (path.endsWith("/doc") ? json({ docVersion: 3, label: "B" }, 200, { etag: '"3"' }) : json({}, 404)));
    await Page(props("44"));
    expect(serverApiFetch.mock.calls.some(([p]) => p.endsWith("/doc/import"))).toBe(false);
  });
});
