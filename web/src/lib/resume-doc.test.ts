import { afterEach, describe, expect, it, vi } from "vitest";
import { createBuilt, exportPdf, fileNameFromDisposition, getDoc, ifMatch, parseEtag, patchTemplate, patchTheme, pdfOutOfDate, putDoc } from "./resume-doc";
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
});

describe("exportPdf", () => {
  it("posts {format:'pdf'} and reads the PDF + its headers", async () => {
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
    expect(url).toBe("/api/resumes/42/export");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ format: "pdf" });
    expect(r).toMatchObject({ kind: "ok", fileName: "Jane-Doe.pdf", pages: 2, fits: false, stored: true, contentHash: "abc" });
    expect(r.kind === "ok" && (await r.blob.text())).toBe("%PDF-1.4");
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

describe("pdfOutOfDate", () => {
  it("is true only for a built resume exported once whose content has since changed", () => {
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: "b", exportedHash: "a" })).toBe(true);
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: "a", exportedHash: "a" })).toBe(false);
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: "a", exportedHash: null })).toBe(false); // never exported
    expect(pdfOutOfDate({ kind: "UPLOADED", contentHash: "b", exportedHash: "a" })).toBe(false);
    expect(pdfOutOfDate({ kind: "BUILT", contentHash: null, exportedHash: "a" })).toBe(false);
  });
});
