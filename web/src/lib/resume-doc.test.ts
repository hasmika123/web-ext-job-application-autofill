import { afterEach, describe, expect, it, vi } from "vitest";
import { checkpointDoc, createBuilt, exportPdf, fileNameFromDisposition, getDoc, ifMatch, parseEtag, patchTemplate, patchTheme, pdfOutOfDate, putDoc, waitForStoredPdf } from "./resume-doc";
import type { ResumeDocument } from "@kiwiply/ui";

const doc = { schema: 2, meta: { title: "t" }, basics: {}, sections: [] } as ResumeDocument;
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

  it("sends the source, label and target to the API as given", async () => {
    const f = stubFetch(json(201, { resume: { id: 5 }, doc: { resumeId: 5 } }));
    await createBuilt({ source: { kind: "copy", fromResumeId: 9 }, label: "X (copy)", target: "Dev", templateId: "modern" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/resumes/built");
    expect(JSON.parse(init.body as string)).toEqual({ source: { kind: "copy", fromResumeId: 9 }, label: "X (copy)", target: "Dev", templateId: "modern" });
  });

  it("maps 422 SENSITIVE_CONTENT to a sensitive result that names where", async () => {
    stubFetch(json(422, { code: "SENSITIVE_CONTENT", path: "structured.experience[1].bullets[0]", message: "We never store a Social Security number - please remove it" }));
    expect(await createBuilt({})).toEqual({
      kind: "sensitive",
      path: "structured.experience[1].bullets[0]",
      message: "We never store a Social Security number - please remove it",
    });
  });

  it("maps other 422s (DOC_INVALID) and a missing copy source", async () => {
    stubFetch(json(422, { code: "DOC_INVALID", path: "$.source.structured", message: "is required for an upload" }));
    expect(await createBuilt({})).toEqual({ kind: "invalid", path: "$.source.structured", message: "is required for an upload" });
    stubFetch(json(404, { error: "x" }));
    expect(await createBuilt({})).toEqual({ kind: "error", message: "That resume is no longer there." });
  });
});

describe("exportPdf", () => {
  it("asks for the stored PDF (cached=1) and reads the PDF + its headers", async () => {
    const f = stubFetch(
      new Response("%PDF-1.4", {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="Jane-Doe.pdf"',
          "x-resume-pdf-pages": "2",
          "x-resume-pdf-fits": "0",
          "x-resume-pdf-stored": "1",
          "x-resume-content-hash": "abc",
        },
      }),
    );
    const r = await exportPdf(42);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/resumes/42/export?format=pdf&cached=1");
    expect(init.method).toBeUndefined(); // a GET: the server serves the stored file when current, else renders
    expect(r).toMatchObject({ kind: "ok", fileName: "Jane-Doe.pdf", pages: 2, fits: false, stored: true, contentHash: "abc", cached: false });
    expect(r.kind === "ok" && (await r.blob.text())).toBe("%PDF-1.4");
  });

  it("knows when the stored file was served (no render)", async () => {
    stubFetch(new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf", "x-resume-pdf-cached": "1", "x-resume-pdf-pages": "1", "x-resume-pdf-stored": "1" } }));
    expect(await exportPdf(42)).toMatchObject({ kind: "ok", cached: true, stored: true, pages: 1 });
  });

  it("maps failures to a message the toast can show", async () => {
    stubFetch(json(503, { error: "The PDF service is busy - try again in a few seconds.", code: "PDF_BUSY" }));
    expect(await exportPdf(1)).toEqual({ kind: "error", status: 503, code: "PDF_BUSY", message: "The PDF service is busy - try again in a few seconds." });
    stubFetch(json(401, {}));
    expect(await exportPdf(1)).toMatchObject({ kind: "error", status: 401, message: expect.stringContaining("sign in") });
    stubFetch(new Error("offline"));
    expect(await exportPdf(1)).toMatchObject({ kind: "error", status: 0 });
  });

  it("parses the download name", () => {
    expect(fileNameFromDisposition('attachment; filename="a b.pdf"', "x.pdf")).toBe("a b.pdf");
    expect(fileNameFromDisposition(null, "x.pdf")).toBe("x.pdf");
  });
});

describe("patchTemplate / patchTheme", () => {
  it("PATCHes the template route with {templateId} and returns the ETag version", async () => {
    const f = stubFetch(json(200, { templateId: "classic", docVersion: 8 }, { etag: '"8"' }));
    expect(await patchTemplate(42, "classic")).toEqual({ kind: "ok", version: 8 });
    expect(f).toHaveBeenCalledWith("/api/resumes/42/doc/template", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ templateId: "classic" }) }));
  });

  it("returns the theme the server stored (its defaults on untouched keys) and can send an exact theme to restore (R3.4)", async () => {
    const f = stubFetch(json(200, { templateId: "classic", docVersion: 8, theme: { fontPair: "source-serif" } }, { etag: '"8"' }));
    expect(await patchTemplate(42, "classic")).toEqual({ kind: "ok", version: 8, theme: { fontPair: "source-serif" } });
    const g =stubFetch(json(200, { templateId: "modern", docVersion: 9, theme: { accent: "#2563eb" } }, { etag: '"9"' }));
    await patchTemplate(42, "modern", { accent: "#2563eb" });
    expect(g).toHaveBeenCalledWith("/api/resumes/42/doc/template", expect.objectContaining({ body: JSON.stringify({ templateId: "modern", theme: { accent: "#2563eb" } }) }));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("PATCHes the theme route with {theme}; no If-Match is sent", async () => {
    const f = stubFetch(json(200, { docVersion: 5 }, { etag: '"5"' }));
    expect(await patchTheme(42, { accent: "#16a34a" })).toEqual({ kind: "ok", version: 5 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/resumes/42/doc/theme");
    expect(init.body).toBe(JSON.stringify({ theme: { accent: "#16a34a" } }));
    expect((init.headers as Record<string, string>)["if-match"]).toBeUndefined();
  });

  it("falls back to docVersion when there is no ETag header, and distrusts an answer with neither", async () => {
    stubFetch(json(200, { docVersion: 9 }));
    expect(await patchTheme(1, {})).toEqual({ kind: "ok", version: 9 });
    stubFetch(json(200, {}));
    expect((await patchTheme(1, {})).kind).toBe("error");
  });

  it("maps a 422 to invalid with the server's message, and everything else to a plain error", async () => {
    stubFetch(json(422, { code: "THEME_INVALID", path: "$.theme.accent", message: "must be a #rgb or #rrggbb colour" }));
    expect(await patchTheme(1, { accent: "red" })).toEqual({ kind: "invalid", message: "must be a #rgb or #rrggbb colour" });
    stubFetch(json(422, { message: "error.resumeDoc", detail: "template 'x' is not enabled" }));
    expect(await patchTemplate(1, "x")).toEqual({ kind: "invalid", message: "template 'x' is not enabled" });
    stubFetch(json(404, {}));
    expect(await patchTheme(1, {})).toMatchObject({ kind: "error", message: expect.stringContaining("no longer there") });
    stubFetch(json(401, {}));
    expect(await patchTemplate(1, "x")).toMatchObject({ kind: "error", message: expect.stringContaining("session expired") });
    stubFetch(json(500, { error: "boom" }));
    expect(await patchTheme(1, {})).toEqual({ kind: "error", message: "boom" });
    stubFetch(new Error("offline"));
    expect(await patchTemplate(1, "x")).toEqual({ kind: "error", message: "Couldn't reach the server." });
  });
});

describe("checkpointDoc (R3.3)", () => {
  it("POSTs the checkpoint route ({} unnamed, {name} named) and reads versionNo / reason / pdf", async () => {
    const f = stubFetch(json(200, { versionNo: 4, reason: "NAMED", pdf: { status: "PENDING" } }));
    expect(await checkpointDoc(42, "Before Acme")).toEqual({ kind: "ok", versionNo: 4, reason: "NAMED", pdf: { status: "PENDING" } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/resumes/42/doc/checkpoint");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Before Acme" }));
    await checkpointDoc(42);
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1].body).toBe("{}");
  });

  it("maps failures to a plain message and never throws", async () => {
    stubFetch(json(422, { message: "error.resumeDoc", detail: "name too long" }));
    expect(await checkpointDoc(1, "x")).toEqual({ kind: "error", status: 422, message: "name too long" });
    stubFetch(json(404, {}));
    expect(await checkpointDoc(1)).toMatchObject({ kind: "error", status: 404, message: expect.stringContaining("no longer there") });
    stubFetch(json(403, { error: "Demo accounts are read-only." }));
    expect(await checkpointDoc(1)).toMatchObject({ kind: "error", status: 403, message: "Demo accounts are read-only." });
    stubFetch(new Error("offline"));
    expect(await checkpointDoc(1)).toEqual({ kind: "error", status: 0, message: "Couldn't reach the server." });
  });
});

describe("waitForStoredPdf (R3.3)", () => {
  const status = (s: string, over: Record<string, unknown> = {}) => json(200, { status: s, pollMs: 5000, pollWindowMs: 20000, ...over });

  it("returns ready as soon as pdf-status says READY, asking at the server's cadence", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn().mockResolvedValueOnce(status("PENDING")).mockResolvedValueOnce(status("RUNNING")).mockResolvedValueOnce(status("READY"));
      vi.stubGlobal("fetch", f);
      const done = waitForStoredPdf(42, { waitMs: 30_000 });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await done).toBe("ready");
      expect(f).toHaveBeenCalledTimes(3);
      expect(f.mock.calls[0][0]).toBe("/api/resumes/42/doc/pdf-status");
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up after waitMs (timeout) and on FAILED, so the caller renders it itself", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", vi.fn(async () => status("PENDING")));
      const slow = waitForStoredPdf(42, { waitMs: 12_000 });
      await vi.advanceTimersByTimeAsync(12_000);
      expect(await slow).toBe("timeout");
      vi.stubGlobal("fetch", vi.fn(async () => status("FAILED")));
      expect(await waitForStoredPdf(42, { waitMs: 12_000 })).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never guesses a cadence: with no hint from the server it falls back at once", async () => {
    const f = vi.fn(async () => json(200, { status: "PENDING" }));
    vi.stubGlobal("fetch", f);
    expect(await waitForStoredPdf(42, { waitMs: 30_000 })).toBe("timeout");
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("pdfOutOfDate", () => {
  it("is true only for a built resume exported once whose content has since changed", () => {
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: "b", exportedHash: "a" })).toBe(true);
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: "a", exportedHash: "a" })).toBe(false);
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: "a", exportedHash: null })).toBe(false); // never exported
    expect(pdfOutOfDate({ kind: "UPLOADED", contentHash: "b", exportedHash: "a" })).toBe(false);
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: null, exportedHash: "a" })).toBe(false);
  });
});
