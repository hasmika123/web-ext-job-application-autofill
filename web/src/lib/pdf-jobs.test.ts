// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeDocument } from "@kiwiply/ui";
import { PdfBusyError, PdfTimeoutError, PdfUnavailableError } from "./pdf";
import { FALLBACK_POLL_MS, failKindOf, runPdfJobsOnce, startPdfWorker } from "./pdf-jobs";

const TOKEN = "worker-secret";
const ENV = { DOSSIER_INTERNAL_TOKEN: TOKEN, RESUME_PDF_WORKER: "1", DOSSIER_API_URL: "http://api.test" };
const DOC = { schema: 2, meta: { title: "T" }, basics: { name: "A" }, sections: [] } as unknown as ResumeDocument;
const JOB = { resumeId: 7, userId: 3, renderHash: "a".repeat(64), templateId: "modern" };

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A scripted Spring: each handler gets the call and returns a Response. */
function fakeApi(handlers: {
  claim?: (c: Call) => Response;
  doc?: (c: Call) => Response;
  pdf?: (c: Call) => Response;
  fail?: (c: Call) => Response;
}) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const call: Call = { url, method: init?.method ?? "GET", headers, body: init?.body };
    calls.push(call);
    if (url.endsWith("/resume-pdf-jobs/claim")) return (handlers.claim ?? (() => Response.json([])))(call);
    if (url.endsWith("/fail")) return (handlers.fail ?? (() => new Response(null, { status: 204 })))(call);
    if (url.endsWith("/doc")) return (handlers.doc ?? (() => Response.json({ doc: DOC, theme: {}, templateId: "modern", renderHash: JOB.renderHash })))(call);
    if (url.endsWith("/pdf")) return (handlers.pdf ?? (() => new Response(null, { status: 204 })))(call);
    throw new Error(`unexpected ${url}`);
  });
  return { calls, fetch: impl as unknown as typeof fetch };
}

const claimOne = () => Response.json([JOB], { headers: { "x-pdf-poll-ms": "7000" } });
const okPdf = { pdf: Buffer.from("%PDF-1.7"), pages: 2, fits: true };

let logs: Array<[string, string]>;
const log = (level: string, line: string) => void logs.push([level, line]);

beforeEach(() => {
  logs = [];
  process.env.DOSSIER_API_URL = "http://api.test";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("runPdfJobsOnce", () => {
  it("renders a claimed job and posts the pdf with the token", async () => {
    const api = fakeApi({ claim: claimOne });
    const exportPdf = vi.fn(async () => okPdf);
    const r = await runPdfJobsOnce({ fetch: api.fetch, exportPdf, env: ENV, log, workerId: "web-1" });

    expect(r).toEqual({ jobs: 1, pollMs: 7000 }); // the interval comes from Spring, not from here
    expect(exportPdf).toHaveBeenCalledWith({ doc: DOC, theme: {}, templateId: "modern" }, { thumbWidth: undefined }); // this claim carries no thumbWidth

    const claim = api.calls[0];
    expect(claim.url).toBe("http://api.test/api/internal/resume-pdf-jobs/claim");
    expect(claim.headers["x-internal-token"]).toBe(TOKEN);
    expect(JSON.parse(String(claim.body))).toEqual({ worker: "web-1", limit: 1 });

    const doc = api.calls[1];
    expect(doc.url).toBe("http://api.test/api/internal/resumes/7/doc");
    expect(doc.headers["x-internal-token"]).toBe(TOKEN);

    const pdf = api.calls[2];
    expect(pdf.url).toBe("http://api.test/api/internal/resumes/7/pdf");
    expect(pdf.headers["x-internal-token"]).toBe(TOKEN);
    const form = pdf.body as FormData;
    expect(form.get("renderHash")).toBe(JOB.renderHash);
    expect(form.get("pages")).toBe("2");
    expect(form.get("fits")).toBe("true");
    expect(Buffer.from(await (form.get("file") as Blob).arrayBuffer()).toString()).toBe("%PDF-1.7");

    expect(api.calls.some((c) => c.url.endsWith("/fail"))).toBe(false);
    expect(logs.some(([, l]) => /^pdf-job 7 ready pages=2 ms=\d+$/.test(l))).toBe(true);
  });

  it("asks for the thumbnail at the width Spring claimed and posts it as the thumb part (R3.13)", async () => {
    const api = fakeApi({ claim: () => Response.json([{ ...JOB, thumbWidth: 240 }]) });
    const exportPdf = vi.fn(async () => ({ ...okPdf, thumb: Buffer.from("\x89PNG-bytes", "latin1") }));
    await runPdfJobsOnce({ fetch: api.fetch, exportPdf, env: ENV, log });

    expect(exportPdf).toHaveBeenCalledWith({ doc: DOC, theme: {}, templateId: "modern" }, { thumbWidth: 240 });
    const form = api.calls[2].body as FormData;
    const thumb = form.get("thumb") as Blob;
    expect(thumb.type).toBe("image/png");
    expect(Buffer.from(await thumb.arrayBuffer()).toString("latin1")).toBe("\x89PNG-bytes");
    expect(form.get("file")).toBeTruthy(); // the PDF travels with it
  });

  it("posts no thumb part when the screenshot did not work, and the PDF still goes", async () => {
    const api = fakeApi({ claim: () => Response.json([{ ...JOB, thumbWidth: 240 }]) });
    await runPdfJobsOnce({ fetch: api.fetch, exportPdf: async () => ({ ...okPdf, thumb: null }), env: ENV, log });
    const form = api.calls[2].body as FormData;
    expect(form.get("thumb")).toBeNull();
    expect(form.get("renderHash")).toBe(JOB.renderHash);
    expect(api.calls.some((c) => c.url.endsWith("/fail"))).toBe(false);
  });

  it("posts the hash of the document it actually rendered when it moved on after the claim", async () => {
    const newer = "b".repeat(64);
    const api = fakeApi({ claim: claimOne, doc: () => Response.json({ doc: DOC, theme: null, templateId: "classic", renderHash: newer }) });
    const exportPdf = vi.fn(async () => okPdf);
    await runPdfJobsOnce({ fetch: api.fetch, exportPdf, env: ENV, log });
    expect(exportPdf).toHaveBeenCalledWith({ doc: DOC, theme: null, templateId: "classic" }, { thumbWidth: undefined });
    expect((api.calls[2].body as FormData).get("renderHash")).toBe(newer);
  });

  it("an idle queue claims nothing further and keeps the fallback interval", async () => {
    const api = fakeApi({});
    const exportPdf = vi.fn();
    const r = await runPdfJobsOnce({ fetch: api.fetch, exportPdf, env: ENV, log });
    expect(r).toEqual({ jobs: 0, pollMs: FALLBACK_POLL_MS });
    expect(api.calls).toHaveLength(1);
    expect(exportPdf).not.toHaveBeenCalled();
  });

  it("a 503 from the limiter reports BUSY (which costs no attempt)", async () => {
    const api = fakeApi({ claim: claimOne });
    await runPdfJobsOnce({
      fetch: api.fetch,
      exportPdf: async () => {
        throw new PdfBusyError();
      },
      env: ENV,
      log,
      workerId: "web-1",
    });
    const fail = api.calls.find((c) => c.url.endsWith("/resume-pdf-jobs/7/fail"));
    expect(fail).toBeDefined();
    expect(fail?.headers["x-internal-token"]).toBe(TOKEN);
    expect(JSON.parse(String(fail?.body))).toMatchObject({ kind: "BUSY", worker: "web-1" });
    expect(api.calls.some((c) => c.url.endsWith("/pdf"))).toBe(false);
  });

  it("a render timeout reports TIMEOUT", async () => {
    const api = fakeApi({ claim: claimOne });
    await runPdfJobsOnce({
      fetch: api.fetch,
      exportPdf: async () => {
        throw new PdfTimeoutError(20_000);
      },
      env: ENV,
      log,
    });
    expect(JSON.parse(String(api.calls.find((c) => c.url.endsWith("/fail"))?.body))).toMatchObject({ kind: "TIMEOUT" });
  });

  it("any other render error reports ERROR with the message", async () => {
    const api = fakeApi({ claim: claimOne });
    await runPdfJobsOnce({
      fetch: api.fetch,
      exportPdf: async () => {
        throw new PdfUnavailableError("sidecar down");
      },
      env: ENV,
      log,
    });
    expect(JSON.parse(String(api.calls.find((c) => c.url.endsWith("/fail"))?.body))).toMatchObject({ kind: "ERROR", message: "sidecar down" });
  });

  it("a refused store reports ERROR; an unloadable document does too and nothing is rendered", async () => {
    const storeRefused = fakeApi({ claim: claimOne, pdf: () => new Response(null, { status: 500 }) });
    await runPdfJobsOnce({ fetch: storeRefused.fetch, exportPdf: async () => okPdf, env: ENV, log });
    expect(JSON.parse(String(storeRefused.calls.find((c) => c.url.endsWith("/fail"))?.body))).toMatchObject({ kind: "ERROR", message: "store answered 500" });

    const noDoc = fakeApi({ claim: claimOne, doc: () => new Response(null, { status: 404 }) });
    const exportPdf = vi.fn();
    await runPdfJobsOnce({ fetch: noDoc.fetch, exportPdf, env: ENV, log });
    expect(exportPdf).not.toHaveBeenCalled();
    expect(JSON.parse(String(noDoc.calls.find((c) => c.url.endsWith("/fail"))?.body))).toMatchObject({ kind: "ERROR", message: "document answered 404" });
  });

  it("never throws: an unreachable API or a refused claim just ends the pass", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(runPdfJobsOnce({ fetch: down, exportPdf: vi.fn(), env: ENV, log })).resolves.toEqual({ jobs: 0, pollMs: FALLBACK_POLL_MS });

    const refused = fakeApi({ claim: () => new Response(null, { status: 401 }) });
    await expect(runPdfJobsOnce({ fetch: refused.fetch, exportPdf: vi.fn(), env: ENV, log })).resolves.toMatchObject({ jobs: 0 });
    expect(logs.some(([l, line]) => l === "warn" && /answered 401/.test(line))).toBe(true);
  });

  it("failKindOf maps the render errors", () => {
    expect(failKindOf(new PdfBusyError())).toBe("BUSY");
    expect(failKindOf(new PdfTimeoutError(1))).toBe("TIMEOUT");
    expect(failKindOf(new Error("x"))).toBe("ERROR");
  });
});

describe("startPdfWorker", () => {
  it("is idle unless RESUME_PDF_WORKER=1: no timer, no request", () => {
    vi.useFakeTimers();
    const api = fakeApi({});
    expect(startPdfWorker({ fetch: api.fetch, env: { DOSSIER_INTERNAL_TOKEN: TOKEN }, log })).toBeNull();
    expect(startPdfWorker({ fetch: api.fetch, env: { ...ENV, RESUME_PDF_WORKER: "0" }, log })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(api.calls).toHaveLength(0);
  });

  it("refuses to start without the internal token", () => {
    vi.useFakeTimers();
    const api = fakeApi({});
    expect(startPdfWorker({ fetch: api.fetch, env: { RESUME_PDF_WORKER: "1" }, log })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(logs.some(([l, line]) => l === "error" && /DOSSIER_INTERNAL_TOKEN/.test(line))).toBe(true);
  });

  it("polls at the interval Spring hands back, drains a burst at once, and stops cleanly", async () => {
    // Only the loop's timers are faked: Response/Blob streams in Node need real setImmediate turns to settle.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let claims = 0;
    const api = fakeApi({
      claim: () => {
        claims += 1;
        return claims === 1 ? claimOne() : Response.json([], { headers: { "x-pdf-poll-ms": "7000" } });
      },
    });
    const exportPdf = vi.fn(async () => okPdf);
    const handle = startPdfWorker({ fetch: api.fetch, exportPdf, env: ENV, log, workerId: "w" });
    expect(handle).not.toBeNull();
    expect(startPdfWorker({ fetch: api.fetch, exportPdf, env: ENV, log, workerId: "w" })).toBe(handle); // idempotent

    const settleIo = async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    };
    const drain = async () => {
      for (let i = 0; i < 200 && claims < 2; i++) {
        await vi.advanceTimersByTimeAsync(1); // fires the next due timer (a 0 ms timer set mid-tick becomes 1 ms)
        await new Promise((r) => setImmediate(r)); // lets the pass's real I/O-ish awaits finish
      }
    };
    await drain(); // first pass: one job; found work, so it asks again straight away: empty
    expect(exportPdf).toHaveBeenCalledTimes(1);
    expect(claims).toBe(2);
    await settleIo(); // the second (empty) answer arrives and the 7 s wait begins
    await vi.advanceTimersByTimeAsync(6_000);
    expect(claims).toBe(2);
    await vi.advanceTimersByTimeAsync(1_100); // 7 s after the empty answer
    expect(claims).toBe(3);

    handle?.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(claims).toBe(3);
  });
});
