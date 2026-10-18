// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exportResumePdf = vi.hoisted(() => vi.fn());
const serverApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getAccessToken: async () => "tok" }));
vi.mock("@/lib/api", () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }) }));
vi.mock("@/lib/pdf", async (orig) => ({
  ...(await orig<typeof import("@/lib/pdf")>()),
  exportResumePdf: (...a: unknown[]) => exportResumePdf(...a),
}));

import { GET, POST } from "./route";

const RENDER = "r".repeat(64);
const STORED = Buffer.from("%PDF-1.4 /Type /Page stored");
const dto = (over: Record<string, unknown> = {}) => ({
  doc: { schema: 2, meta: { title: "T" }, basics: { name: "Jane Doe" }, sections: [] },
  theme: null,
  templateId: "modern",
  contentHash: "c".repeat(64),
  renderHash: RENDER,
  label: "Jane Doe - Backend",
  pdf: { status: "READY", hash: RENDER },
  ...over,
});

let uploads: Array<{ url: string; init: RequestInit }>;
let recorded: unknown[];
let photoCalls: string[];

beforeEach(() => {
  uploads = [];
  recorded = [];
  photoCalls = [];
  exportResumePdf.mockReset().mockResolvedValue({ pdf: Buffer.from("%PDF-1.4 /Type /Page fresh"), pages: 1, step: 0, startStep: 0, target: 1, fits: true });
  serverApiFetch.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/doc")) return Response.json(dto(currentDto));
    if (path.endsWith("/photo")) {
      photoCalls.push(path);
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    if (path.endsWith("/file")) return storedFile();
    if (path.endsWith("/export-recorded")) {
      recorded.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${path}`);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      uploads.push({ url, init });
      return new Response(null, { status: 200 });
    }),
  );
  currentDto = {};
  storedFile = () => new Response(STORED, { status: 200, headers: { "content-type": "application/pdf" } });
});
afterEach(() => vi.unstubAllGlobals());

let currentDto: Record<string, unknown> = {};
let storedFile: () => Response = () => new Response(null, { status: 404 });

const ctx = { params: Promise.resolve({ id: "7" }) };
const get = (qs = "format=pdf&cached=1") => GET(new Request(`http://web/api/resumes/7/export?${qs}`), ctx);

describe("GET /api/resumes/:id/export?format=pdf&cached=1", () => {
  it("serves the stored file when it is READY and current, without rendering", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(STORED.toString());
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Jane-Doe-Backend.pdf"');
    expect(res.headers.get("x-resume-pdf-cached")).toBe("1");
    expect(res.headers.get("x-resume-pdf-stored")).toBe("1");
    expect(res.headers.get("x-resume-pdf-pages")).toBe("1");
    expect(exportResumePdf).not.toHaveBeenCalled(); // no Chromium call
    expect(uploads).toHaveLength(0);
    expect(recorded).toHaveLength(0);
  });

  it.each([
    ["STALE", { status: "READY", hash: "old".padEnd(64, "0") }],
    ["PENDING", { status: "PENDING", hash: null }],
    ["RUNNING", { status: "RUNNING", hash: null }],
    ["FAILED", { status: "FAILED", hash: null }],
    ["NONE", { status: "NONE", hash: null }],
  ])("renders synchronously and stores through the same path when the PDF is %s", async (_name, pdf) => {
    currentDto = { pdf };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-resume-pdf-cached")).toBeNull();
    expect(exportResumePdf).toHaveBeenCalledTimes(1);
    // stored on the resume, then recorded with the RENDER hash (so the job flips to READY)
    expect(uploads).toHaveLength(1);
    expect(uploads[0].url).toMatch(/\/api\/resumes\/7\/file$/);
    expect(recorded).toEqual([{ hash: RENDER }]);
    expect(res.headers.get("x-resume-pdf-stored")).toBe("1");
    expect(res.headers.get("x-resume-render-hash")).toBe(RENDER);
  });

  describe("the photo (R7.4)", () => {
    const withPhoto = (templateId: string, theme: unknown) => ({
      pdf: { status: "NONE", hash: null },
      templateId,
      theme,
      doc: { schema: 2, meta: { title: "T" }, basics: { name: "Jane Doe", photo: { key: "resume-photos/3/7-abc-photo.jpg" } }, sections: [] },
    });

    it("inlines the photo as a data URI for the render when the template draws it", async () => {
      currentDto = withPhoto("sidebar", { showPhoto: true });
      const res = await get();
      expect(res.status).toBe(200);
      expect(photoCalls).toEqual(["/api/profile/resumes/7/photo"]);
      const input = exportResumePdf.mock.calls[0]![0] as { photoSrc?: string };
      expect(input.photoSrc).toBe(`data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 1, 2]).toString("base64")}`);
    });

    it.each([
      ["an ATS template", "modern", { showPhoto: true }],
      ["a theme that hides it", "sidebar", { showPhoto: false }],
      ["the default (off)", "sidebar", null],
    ])("does not fetch it for %s", async (_name, templateId, theme) => {
      currentDto = withPhoto(templateId, theme);
      const res = await get();
      expect(res.status).toBe(200);
      expect(photoCalls).toEqual([]);
      expect(exportResumePdf.mock.calls[0]![0]).not.toHaveProperty("photoSrc");
    });
  });

  it("renders when the stored object is gone", async () => {
    storedFile = () => new Response(null, { status: 404 });
    const res = await get();
    expect(res.status).toBe(200);
    expect(exportResumePdf).toHaveBeenCalledTimes(1);
  });

  it("renders for an API that does not report the PDF state", async () => {
    currentDto = { pdf: null, renderHash: null };
    const res = await get();
    expect(res.status).toBe(200);
    expect(exportResumePdf).toHaveBeenCalledTimes(1);
    // the TS twin of the render hash stands in for the one Spring did not send
    const sent = (recorded[0] as { hash: string }).hash;
    expect(sent).toMatch(/^[0-9a-f]{64}$/);
    expect(sent).not.toBe(RENDER);
  });

  it("refuses a GET that does not ask for the cached form", async () => {
    expect((await get("format=pdf")).status).toBe(400);
    expect((await get("cached=1")).status).toBe(400);
    expect(exportResumePdf).not.toHaveBeenCalled();
  });

  it("passes the document's 404 through", async () => {
    serverApiFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await get()).status).toBe(404);
  });
});

describe("POST /api/resumes/:id/export", () => {
  it("always renders (even when the stored PDF is current) and records the render hash", async () => {
    const res = await POST(
      new Request("http://web/api/resumes/7/export", { method: "POST", body: JSON.stringify({ format: "pdf" }) }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(exportResumePdf).toHaveBeenCalledTimes(1);
    expect(recorded).toEqual([{ hash: RENDER }]);
  });
});
