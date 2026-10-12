import { afterEach, describe, expect, it, vi } from "vitest";
import { createBuilt, getDoc, ifMatch, parseEtag, putDoc } from "./resume-doc";
import type { ResumeDocument } from "@kiwiply/ui";

const doc = { schema: 1, meta: { title: "t" }, basics: {}, sections: [] } as ResumeDocument;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => vi.unstubAllGlobals());
const stubFetch = (res: Response | Error) => {
  const f = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal("fetch", f);
  return f;
};

describe("etag helpers", () => {
  it("parses strong and weak ETags", () => {
    expect(parseEtag('"7"')).toBe(7);
    expect(parseEtag('W/"12"')).toBe(12);
    expect(parseEtag("3")).toBe(3);
    expect(parseEtag(null)).toBeNull();
    expect(parseEtag('"abc"')).toBeNull();
  });
  it("quotes the If-Match value", () => expect(ifMatch(5)).toBe('"5"'));
});

describe("putDoc", () => {
  it("sends If-Match and adopts the response ETag", async () => {
    const f = stubFetch(json(200, { docVersion: 4, contentHash: "h" }, { etag: '"4"' }));
    const r = await putDoc(42, 3, { doc });
    expect(r).toEqual({ kind: "ok", version: 4, contentHash: "h" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/resumes/42/doc");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["if-match"]).toBe('"3"');
    expect(JSON.parse(init.body as string)).toEqual({ doc });
  });

  it("maps 409 DOC_VERSION_CONFLICT to a conflict carrying the server document", async () => {
    stubFetch(json(409, { code: "DOC_VERSION_CONFLICT", serverVersion: 8, doc }));
    expect(await putDoc(1, 3, { doc })).toEqual({ kind: "conflict", serverVersion: 8, doc });
  });

  it("maps 422 DOC_INVALID to path + message", async () => {
    stubFetch(json(422, { code: "DOC_INVALID", path: "$.sections[0]", message: "bad" }));
    expect(await putDoc(1, 3, { doc })).toEqual({ kind: "invalid", path: "$.sections[0]", message: "bad" });
  });

  it("treats network errors, 5xx and 429 as retryable", async () => {
    stubFetch(new Error("offline"));
    expect((await putDoc(1, 1, { doc })).kind).toBe("network");
    stubFetch(json(502, { error: "x" }));
    expect((await putDoc(1, 1, { doc })).kind).toBe("network");
    stubFetch(json(429, {}));
    expect((await putDoc(1, 1, { doc })).kind).toBe("network");
  });

  it("treats 401 / 404 / 413 as fatal with a readable message", async () => {
    stubFetch(json(401, {}));
    expect(await putDoc(1, 1, { doc })).toMatchObject({ kind: "fatal", status: 401, message: expect.stringContaining("session expired") });
    stubFetch(json(413, { code: "DOC_TOO_LARGE" }));
    expect(await putDoc(1, 1, { doc })).toMatchObject({ kind: "fatal", status: 413, code: "DOC_TOO_LARGE" });
    stubFetch(json(404, {}));
    expect(await putDoc(1, 1, { doc })).toMatchObject({ kind: "fatal", status: 404 });
  });

  it("does not trust a 200 without a version", async () => {
    stubFetch(json(200, {}));
    expect((await putDoc(1, 1, { doc })).kind).toBe("network");
  });
});

describe("getDoc", () => {
  it("returns the DTO and the ETag version", async () => {
    stubFetch(json(200, { docVersion: 2, doc }, { etag: '"6"' }));
    const r = await getDoc(1);
    expect(r).toMatchObject({ kind: "ok", version: 6 });
  });
  it("reports the status on failure", async () => {
    stubFetch(json(404, {}));
    expect(await getDoc(1)).toEqual({ kind: "error", status: 404 });
  });
});

describe("createBuilt", () => {
  it("returns the new resume id", async () => {
    stubFetch(json(201, { resume: { id: 77, label: "x" }, doc: { resumeId: 77 } }));
    expect(await createBuilt({})).toEqual({ kind: "ok", id: 77 });
  });

  it("maps 402 RESUME_LIMIT to a limit result with the server's copy and plan", async () => {
    stubFetch(json(402, { code: "RESUME_LIMIT", detail: "Free accounts keep up to 3 resumes.", plan: "FREE", limit: 3, count: 3 }));
    expect(await createBuilt({})).toEqual({ kind: "limit", plan: "FREE", message: "Free accounts keep up to 3 resumes." });
  });

  it("explains a demo-account refusal", async () => {
    stubFetch(json(403, { error: "This is a demo account - changes aren't saved", code: "DEMO_READ_ONLY" }));
    expect(await createBuilt({})).toEqual({ kind: "error", message: "This is a demo account - changes aren't saved" });
  });

  it("survives a network failure", async () => {
    stubFetch(new Error("offline"));
    expect((await createBuilt({})).kind).toBe("error");
  });
});
