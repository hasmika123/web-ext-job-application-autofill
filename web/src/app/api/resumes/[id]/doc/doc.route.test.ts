import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";

const serverApiFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (path: string, init?: RequestInit) => serverApiFetch(path, init) }));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import { resetScoreSettingsCache } from "@/lib/resume-score-server";
import { PUT } from "./route";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../../../../../../packages/ui/src/resume/__fixtures__");
const fixture = (name: string) => JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8")) as unknown;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

let stored: { templateId: string; theme: unknown };
let putBodies: Array<Record<string, unknown>>;
let putHeaders: Array<Headers>;

beforeEach(() => {
  resetScoreSettingsCache();
  stored = { templateId: "modern", theme: {} };
  putBodies = [];
  putHeaders = [];
  serverApiFetch.mockImplementation(async (path, init) => {
    if (path === "/api/profile/resume-builder/config") return json(DEFAULT_BUILDER_CONFIG);
    if (path === "/api/profile/resumes/7/doc" && init?.method === "PUT") {
      putBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      putHeaders.push(new Headers(init.headers));
      return json({ docVersion: 4 }, 200, { etag: '"4"' });
    }
    if (path === "/api/profile/resumes/7/doc") return json({ resumeId: 7, ...stored });
    return json({}, 404);
  });
});
afterEach(() => {
  serverApiFetch.mockReset();
});

const put = (body: unknown, ifMatch: string | null = '"3"') =>
  PUT(
    new Request("http://web.test/api/resumes/7/doc", {
      method: "PUT",
      headers: { "content-type": "application/json", ...(ifMatch ? { "if-match": ifMatch } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx("7"),
  );

describe("PUT /api/resumes/:id/doc (score forwarded)", () => {
  it("computes the score with the shared engine and forwards {doc, score}; relays Spring's ETag and If-Match", async () => {
    const res = await put({ doc: fixture("score-strong") });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"4"');
    expect(putBodies).toHaveLength(1);
    const sent = putBodies[0]!;
    expect(sent.doc).toEqual(fixture("score-strong"));
    // Modern is ATS_STRICT, so G6 counts: strong scores 100 on it too.
    expect(sent.score).toMatchObject({ rulesetVersion: "v1", score: 100 });
    expect((sent.score as { groups: unknown[] }).groups).toHaveLength(6);
    expect(putHeaders[0]!.get("if-match")).toBe('"3"');
  });

  it("scores against the STORED template and theme (the mid doc with the photo shown fails G6 on Modern)", async () => {
    stored = { templateId: "modern", theme: { showPhoto: true } };
    await put({ doc: fixture("score-mid") });
    const score = putBodies[0]!.score as { groups: Array<{ id: string; pass: boolean }> };
    expect(score.groups.find((g) => g.id === "G6")!.pass).toBe(false);
  });

  it("drops a score the browser sent, and does not forward pages", async () => {
    await put({ doc: fixture("score-empty"), pages: 3, score: { rulesetVersion: "v1", score: 100, groups: [] } });
    const sent = putBodies[0]!;
    expect(sent.pages).toBeUndefined();
    expect((sent.score as { score: number }).score).not.toBe(100);
    expect((sent.score as { score: number }).score).toBeGreaterThan(0);
  });

  it("uses the measured page count: a 3-page resume fails F4", async () => {
    await put({ doc: fixture("score-strong"), pages: 3 });
    const sent = putBodies[0]!.score as { score: number; groups: Array<{ id: string; fraction: number }> };
    expect(sent.groups.find((g) => g.id === "G4")!.fraction).toBeLessThan(1);
    expect(sent.score).toBeLessThan(100);
  });

  it("forwards a theme that the body carries untouched", async () => {
    await put({ doc: fixture("score-strong"), theme: { accent: "#2563eb" } });
    expect(putBodies[0]!.theme).toEqual({ accent: "#2563eb" });
  });

  it("still saves, without a score, when the stored document cannot be read", async () => {
    serverApiFetch.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") {
        putBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        return json({ docVersion: 4 }, 200, { etag: '"4"' });
      }
      return json({}, 500);
    });
    const res = await put({ doc: fixture("score-strong") });
    expect(res.status).toBe(200);
    expect(putBodies[0]).not.toHaveProperty("score");
  });

  it("relays Spring's refusals verbatim (409 conflict body)", async () => {
    serverApiFetch.mockImplementation(async (path, init) => {
      if (init?.method === "PUT") return json({ code: "DOC_VERSION_CONFLICT", serverVersion: 5, doc: { schema: 2 } }, 409);
      if (path === "/api/profile/resume-builder/config") return json(DEFAULT_BUILDER_CONFIG);
      return json({ templateId: "modern", theme: {} });
    });
    const res = await put({ doc: fixture("score-strong") });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("DOC_VERSION_CONFLICT");
  });

  it("rejects a bad id and an empty body; passes a non-JSON body to Spring to refuse", async () => {
    const bad = await PUT(new Request("http://web.test/api/resumes/x/doc", { method: "PUT", body: "{}" }), ctx("x"));
    expect(bad.status).toBe(400);
    expect((await put("   ")).status).toBe(400);
    serverApiFetch.mockImplementation(async () => json({ code: "DOC_INVALID", path: "$" }, 422));
    expect((await put("not json")).status).toBe(422);
  });

  it("caches the settings between saves (one config fetch for two saves)", async () => {
    await put({ doc: fixture("score-strong") });
    await put({ doc: fixture("score-strong") });
    expect(serverApiFetch.mock.calls.filter(([p]) => p === "/api/profile/resume-builder/config")).toHaveLength(1);
  });
});
