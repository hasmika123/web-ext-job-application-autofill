import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (p: string, i?: RequestInit) => serverApiFetch(p, i) }));
const getPlan = vi.fn(async () => ({ plan: "PRO" }));
vi.mock("@/lib/billing", () => ({ getPlan: () => getPlan() }));
const getAiUsage = vi.fn(async () => null);
vi.mock("@/lib/ai-usage", () => ({ getAiUsage: () => getAiUsage(), describeAiUsage: () => null }));
const getBuilderConfig = vi.fn(async (init?: RequestInit) => ({ templates: { default: "modern" }, init }));
vi.mock("@/lib/resume-builder-config", () => ({ getBuilderConfig: (i?: RequestInit) => getBuilderConfig(i) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

import { editorTitle, loadEditorData, withoutStorageKeys } from "./resume-editor-data";
import type { ResumeDocDTO } from "./resume-doc";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const header = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadEditorData: one loader for every place the one editor is mounted", () => {
  it("personal and consultant sessions read the person's own plan, AI meter, profile time and primary, and convert an uploaded file in place", async () => {
    let imported = false;
    serverApiFetch.mockImplementation(async (path, init) => {
      if (path.endsWith("/doc/import") && init?.method === "POST") {
        imported = true;
        return json({});
      }
      if (path.endsWith("/doc")) return imported ? json({ docVersion: 2, label: "Uploaded" }, 200, { etag: '"2"' }) : json({}, 404);
      if (path === "/api/profile") return json({ updatedAt: "2026-10-01T00:00:00Z" });
      if (path === "/api/profile/resumes") return json([{ id: 42, primary: true }]);
      if (path.endsWith("/meta")) return json({ id: 42 });
      return json({}, 404);
    });
    const data = await loadEditorData("42");
    expect(imported).toBe(true);
    expect(data.kind).toBe("ok");
    if (data.kind !== "ok") return;
    expect(data.initial.docVersion).toBe(2);
    expect(data.plan).toBe("PRO");
    expect(data.profileUpdatedAt).toBe("2026-10-01T00:00:00Z");
    expect(data.primaryResumeId).toBe(42);
    expect(getPlan).toHaveBeenCalled();
  });

  it("acting for a consultant names the directory row on every call, never converts, and reads nothing of the marketer's own plan, AI meter, profile or primary", async () => {
    serverApiFetch.mockImplementation(async (path, init) => {
      if (path.endsWith("/doc") && header(init, "X-Kiwiply-Act-For") === "5") return json({ docVersion: 3, label: "Casey's" }, 200, { etag: '"3"' });
      if (path.endsWith("/meta") && header(init, "X-Kiwiply-Act-For") === "5") return json({ id: 42 });
      return json({}, 404);
    });
    const data = await loadEditorData("42", 5);
    expect(data.kind).toBe("ok");
    if (data.kind !== "ok") return;
    expect(data.initial.label).toBe("Casey's");
    expect(data.plan).toBe("FREE");
    expect(data.profileUpdatedAt).toBeNull();
    expect(data.primaryResumeId).toBeNull();
    expect(getPlan).not.toHaveBeenCalled();
    expect(getAiUsage).not.toHaveBeenCalled();
    expect(getBuilderConfig).toHaveBeenCalledWith({ headers: { "X-Kiwiply-Act-For": "5" } });
    expect(serverApiFetch.mock.calls.some(([p]) => p.endsWith("/doc/import"))).toBe(false);
    expect(serverApiFetch.mock.calls.some(([p]) => p === "/api/profile" || p === "/api/profile/resumes")).toBe(false);
  });

  it("acting for someone drops any storage key from the document before the client sees it (defence in depth), the owner's own load is untouched", async () => {
    const keyed = {
      docVersion: 3,
      label: "Casey's",
      doc: { meta: { title: "T", originalFileKey: "resume-originals/7/1-o.pdf" }, basics: { name: "Ada", photo: { key: "resume-photos/7/1-p.png", updatedAt: "2026-10-01T00:00:00Z" } } },
    };
    serverApiFetch.mockImplementation(async (path) => (path.endsWith("/doc") ? json(keyed, 200, { etag: '"3"' }) : json({}, 404)));
    const acting = await loadEditorData("42", 5);
    expect(acting.kind).toBe("ok");
    if (acting.kind === "ok") expect(JSON.stringify(acting.initial)).not.toMatch(/resume-originals|resume-photos|originalFileKey/);
    const own = await loadEditorData("42");
    if (own.kind === "ok") expect(JSON.stringify(own.initial)).toContain("resume-photos");
    // the photo object stays (the editor knows there is one) and the input is not modified
    const dto = keyed as unknown as ResumeDocDTO;
    const out = withoutStorageKeys(dto) as unknown as { doc: { basics: { photo: Record<string, string> } } };
    expect(out.doc.basics.photo).toEqual({ updatedAt: "2026-10-01T00:00:00Z" });
    expect(JSON.stringify(keyed)).toContain("resume-originals");
  });

  it("a resume that is not the caller's (or a refused act-for) is a plain not-found, a signed-out call is sign-in, anything else is an error", async () => {
    serverApiFetch.mockImplementation(async () => json({}, 404));
    expect((await loadEditorData("42")).kind).toBe("notFound");
    expect((await loadEditorData("42", 5)).kind).toBe("notFound");
    expect((await loadEditorData("abc")).kind).toBe("notFound");
    serverApiFetch.mockImplementation(async () => json({}, 401));
    expect((await loadEditorData("42")).kind).toBe("signin");
    serverApiFetch.mockImplementation(async () => json({}, 500));
    expect(await loadEditorData("42")).toEqual({ kind: "error", status: 500 });
  });

  it("the tab title is the resume's name, with a fallback", async () => {
    serverApiFetch.mockImplementation(async (path) => (path.endsWith("/doc") ? json({ docVersion: 1, label: "  Java Backend " }, 200, { etag: '"1"' }) : json({}, 404)));
    expect(await editorTitle("42")).toBe("Java Backend");
    serverApiFetch.mockImplementation(async () => json({}, 404));
    expect(await editorTitle("42")).toBe("Edit resume");
    expect(await editorTitle("nope")).toBe("Edit resume");
  });
});
