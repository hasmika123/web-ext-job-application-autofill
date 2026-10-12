// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumePreview } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import {
  PdfBusyError,
  PdfTimeoutError,
  PdfUnavailableError,
  countPdfPages,
  createLimiter,
  exportResumePdf,
  pagePixels,
  printPdf,
  printPdfWithThumb,
  readPdfConfig,
  renderResumeHtml,
  resetPdfLimiter,
} from "./pdf";
import { pdfFileName } from "./pdf-name";

/* A fake `playwright-core`: the real one needs a browser. `pdfImpl` is swapped per test. */
const pw = vi.hoisted(() => {
  const state = {
    pdfImpl: async (): Promise<Buffer> => Buffer.from("%PDF-1.4"),
    screenshotImpl: async (): Promise<Buffer> => Buffer.from("\x89PNG", "latin1"),
    contextOpts: [] as unknown[],
    shots: [] as unknown[],
    media: [] as string[],
    closed: 0,
    connect: vi.fn(),
    launch: vi.fn(),
    makeBrowser() {
      return {
        newContext: async (opts: unknown) => ({
          newPage: async () => {
            state.contextOpts.push(opts);
            return {
              route: async () => undefined,
              setContent: async () => undefined,
              emulateMedia: async (o: { media: string }) => void state.media.push(o.media),
              setDefaultTimeout: () => undefined,
              pdf: () => state.pdfImpl(),
              screenshot: (o: unknown) => {
                state.shots.push(o);
                return state.screenshotImpl();
              },
            };
          },
          close: async () => undefined,
        }),
        close: async () => {
          state.closed += 1;
        },
      };
    },
  };
  return state;
});
vi.mock("playwright-core", () => ({ chromium: { connectOverCDP: pw.connect, launch: pw.launch } }));

const fixture = (name: string): ResumeDocument =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../../packages/ui/src/resume/__fixtures__", `${name}.json`), "utf8")) as ResumeDocument;

/** The fonts are ~230 KB of base64; keep snapshots readable. */
const withoutFontBytes = (html: string) => html.replace(/base64,[A-Za-z0-9+/=]+/g, "base64,…");

const ENV_KEYS = ["PDF_BROWSER_URL", "PDF_LOCAL_CHANNEL", "RESUME_PDF_TIMEOUT_MS", "RESUME_PDF_MAX_CONCURRENT", "RESUME_PDF_QUEUE_MAX", "RESUME_PDF_MAX_FIT_STEPS"];
beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  resetPdfLimiter();
  pw.pdfImpl = async () => Buffer.from("%PDF-1.4");
  pw.screenshotImpl = async () => Buffer.from("\x89PNG", "latin1");
  pw.contextOpts = [];
  pw.shots = [];
  pw.media = [];
  pw.connect.mockReset().mockImplementation(async () => pw.makeBrowser());
  pw.launch.mockReset().mockImplementation(async () => pw.makeBrowser());
  pw.closed = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("renderResumeHtml", () => {
  it("is a self-contained document (snapshot, font bytes elided)", async () => {
    const html = renderResumeHtml({ doc: fixture("sparse"), templateId: "modern" });
    await expect(withoutFontBytes(html)).toMatchFileSnapshot("./__snapshots__/pdf-sparse.html");
  });

  it("inlines resume.css with the fonts as data URIs and no external references", () => {
    const html = renderResumeHtml({ doc: fixture("full") });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@font-face");
    expect(html).toContain("url(data:font/woff2;base64,");
    expect(html).not.toContain("../fonts/");
    expect(html).not.toMatch(/<link\b|<script\b|@import/);
    expect(html).toContain("@page{size:8.5in 11in;margin:0.75in}");
  });

  it("contains exactly the markup the editor preview renders (one render tree)", () => {
    const doc = fixture("full");
    const theme = { accent: "#0f766e" };
    const preview = renderToStaticMarkup(<ResumePreview doc={doc} theme={theme} templateId="modern" />);
    expect(renderResumeHtml({ doc, theme, templateId: "modern" })).toContain(preview);
  });

  it("a ladder step override changes the type size and margins, nothing else", () => {
    const doc = fixture("sparse");
    const roomy = renderResumeHtml({ doc }, { step: 0 });
    const tight = renderResumeHtml({ doc }, { step: 6 });
    expect(roomy).toContain("--rz-size:11pt");
    expect(tight).toContain("--rz-size:9.5pt");
    expect(tight).toContain("--rz-margin:0.45in");
    expect(tight).toContain("Barista");
  });

  it("escapes the title and survives hostile text", () => {
    const doc = fixture("sparse");
    doc.meta.title = '</title><script>alert(1)</script>';
    doc.basics.name = "<img src=x onerror=alert(1)>";
    const html = renderResumeHtml({ doc });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
  });
});

describe("createLimiter", () => {
  it("runs one job at a time, queues up to queueMax in order, and rejects beyond", async () => {
    const l = createLimiter(1, 2);
    const order: string[] = [];
    const gates: Array<() => void> = [];
    const job = (name: string) => () =>
      new Promise<string>((resolve) => {
        order.push(`start ${name}`);
        gates.push(() => resolve(name));
      });

    const a = l.run(job("a"));
    const b = l.run(job("b"));
    const c = l.run(job("c"));
    expect(l.running).toBe(1);
    expect(l.waiting).toBe(2);
    await expect(l.run(job("d"))).rejects.toBeInstanceOf(PdfBusyError);
    expect(order).toEqual(["start a"]);

    gates[0]();
    await a;
    await Promise.resolve();
    expect(order).toEqual(["start a", "start b"]);
    gates[1]();
    await b;
    await Promise.resolve();
    gates[2]();
    await expect(c).resolves.toBe("c");
    expect(order).toEqual(["start a", "start b", "start c"]);
    expect(l.running).toBe(0);
    expect(l.waiting).toBe(0);
    // capacity is back
    await expect(l.run(async () => "e")).resolves.toBe("e");
  });

  it("frees the slot when a job throws", async () => {
    const l = createLimiter(1, 0);
    await expect(l.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(l.run(async () => 1)).resolves.toBe(1);
  });
});

describe("printPdf", () => {
  it("prints through the sidecar when PDF_BROWSER_URL is set, and closes the browser", async () => {
    process.env.PDF_BROWSER_URL = "ws://chromium:3000";
    const pdf = await printPdf("<p>hi</p>");
    expect(pdf.toString()).toBe("%PDF-1.4");
    expect(pw.connect).toHaveBeenCalledWith("ws://chromium:3000", expect.anything());
    expect(pw.launch).not.toHaveBeenCalled();
    expect(pw.closed).toBe(1);
  });

  it("falls back to a local Edge, then Chrome, without PDF_BROWSER_URL", async () => {
    pw.launch.mockRejectedValueOnce(new Error("msedge missing"));
    await printPdf("<p>hi</p>");
    expect(pw.launch.mock.calls.map((c) => c[0].channel)).toEqual(["msedge", "chrome"]);
  });

  it("is PdfUnavailable when no browser can be reached", async () => {
    process.env.PDF_BROWSER_URL = "ws://nowhere:1";
    pw.connect.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    await expect(printPdf("x")).rejects.toBeInstanceOf(PdfUnavailableError);
    delete process.env.PDF_BROWSER_URL;
    pw.launch.mockRejectedValue(new Error("no browser"));
    await expect(printPdf("x")).rejects.toBeInstanceOf(PdfUnavailableError);
  });

  it("serves one at a time and answers 'busy' beyond the queue", async () => {
    process.env.RESUME_PDF_QUEUE_MAX = "1";
    let release!: () => void;
    pw.pdfImpl = () => new Promise<Buffer>((resolve) => (release = () => resolve(Buffer.from("%PDF"))));
    const first = printPdf("1");
    await vi.waitFor(() => expect(pw.launch).toHaveBeenCalledTimes(1));
    const second = printPdf("2"); // queued
    await expect(printPdf("3")).rejects.toBeInstanceOf(PdfBusyError); // 1 running + 1 queued = full
    expect(pw.launch).toHaveBeenCalledTimes(1); // the second has not started
    release();
    await first;
    await vi.waitFor(() => expect(pw.launch).toHaveBeenCalledTimes(2));
    pw.pdfImpl = async () => Buffer.from("%PDF");
    release();
    await expect(second).resolves.toBeDefined();
  });

  it("times out after resume.pdf.timeoutMs (plus a short grace) and frees its slot", async () => {
    vi.useFakeTimers();
    process.env.RESUME_PDF_TIMEOUT_MS = "1000";
    pw.pdfImpl = () => new Promise<Buffer>(() => undefined); // never finishes
    const p = printPdf("x");
    const assertion = expect(p).rejects.toBeInstanceOf(PdfTimeoutError);
    await vi.advanceTimersByTimeAsync(3100);
    await assertion;
    pw.pdfImpl = async () => Buffer.from("%PDF");
    await expect(printPdf("again")).resolves.toBeDefined();
  });
});

describe("readPdfConfig", () => {
  it("has safe defaults", () => {
    expect(readPdfConfig({})).toEqual({
      browserUrl: "",
      localChannel: "",
      timeoutMs: 20_000,
      maxConcurrent: 1,
      queueMax: 10,
      maxFitSteps: 3,
    });
  });
  it("reads env, clamps, and ignores junk", () => {
    const c = readPdfConfig({ PDF_BROWSER_URL: " ws://c:3000 ", RESUME_PDF_TIMEOUT_MS: "5", RESUME_PDF_QUEUE_MAX: "abc", RESUME_PDF_MAX_FIT_STEPS: "99" });
    expect(c.browserUrl).toBe("ws://c:3000");
    expect(c.timeoutMs).toBe(1000); // clamped up
    expect(c.queueMax).toBe(10); // junk -> default
    expect(c.maxFitSteps).toBe(6); // clamped to the ladder
  });
});

describe("countPdfPages", () => {
  it("counts /Type /Page objects but not /Pages", () => {
    const pdf = Buffer.from("<</Type /Pages /Count 2>> <</Type /Page /Parent 1 0 R>> <</Type /Page\n/Resources 3 0 R>>", "latin1");
    expect(countPdfPages(pdf)).toBe(2);
  });
  it("is never less than 1", () => {
    expect(countPdfPages(Buffer.from("garbage"))).toBe(1);
  });
});

describe("card thumbnail (R3.13)", () => {
  it("takes ONE screenshot of the first page after page.pdf(), scaled to the asked width", async () => {
    const out = await printPdfWithThumb("<html></html>", { pageSize: "letter", thumbWidth: 240 });
    expect(out.pdf.toString()).toBe("%PDF-1.4");
    expect(out.thumb?.toString("latin1")).toBe("\x89PNG");
    expect(pw.shots).toEqual([{ type: "png", clip: { x: 0, y: 0, width: 816, height: 1056 } }]);
    const ctx = pw.contextOpts[0] as { viewport: { width: number; height: number }; deviceScaleFactor: number; javaScriptEnabled: boolean };
    expect(ctx.viewport).toEqual({ width: 816, height: 1056 }); // one Letter page at 96 dpi
    expect(ctx.deviceScaleFactor).toBeCloseTo(240 / 816, 5); // the output PNG is 240 px wide
    expect(ctx.javaScriptEnabled).toBe(false);
    expect(pw.media).toEqual(["print", "screen"]); // print for the PDF, then the editor's look for the picture
  });

  it("uses the A4 page box for A4", async () => {
    await printPdfWithThumb("<html></html>", { pageSize: "a4", thumbWidth: 120 });
    expect(pw.shots[0]).toEqual({ type: "png", clip: { x: 0, y: 0, width: pagePixels("a4").width, height: pagePixels("a4").height } });
  });

  it("takes no screenshot unless a width is asked for", async () => {
    const out = await printPdfWithThumb("<html></html>", { pageSize: "letter" });
    expect(out.thumb).toBeNull();
    expect(pw.shots).toEqual([]);
    expect(pw.contextOpts[0]).toEqual({ javaScriptEnabled: false });
    expect((await printPdf("<html></html>")).toString()).toBe("%PDF-1.4"); // the plain printer is unchanged
  });

  it("a failing screenshot never fails the PDF", async () => {
    pw.screenshotImpl = async () => {
      throw new Error("screenshot blew up");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = await printPdfWithThumb("<html></html>", { pageSize: "letter", thumbWidth: 240 });
    expect(out.pdf.toString()).toBe("%PDF-1.4");
    expect(out.thumb).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("resume.thumb.failed"));
    warn.mockRestore();
  });

  it("exportResumePdf hands the thumbnail of the FINAL print through, and asks for it at the width given", async () => {
    const seen: Array<number | undefined> = [];
    let i = 0;
    const r = await exportResumePdf(
      { doc: fixture("sparse") },
      {
        print: async (_html, o) => {
          seen.push(o.thumbWidth);
          return { pdf: Buffer.from(`pdf${i}`), thumb: Buffer.from(`thumb${i++}`) };
        },
        countPages: () => 1,
        log: vi.fn(),
      },
      { thumbWidth: 240 },
    );
    expect(seen).toEqual([240]);
    expect(r.thumb?.toString()).toBe("thumb0");
    // a print that answers the bare PDF (the existing seam) means no thumbnail
    const plain = await exportResumePdf({ doc: fixture("sparse") }, { print: async () => Buffer.from("pdf"), countPages: () => 1, log: vi.fn() });
    expect(plain.thumb).toBeNull();
  });
});

describe("exportResumePdf ladder", () => {
  const doc = fixture("sparse");
  /** A print/count pair that reports `pageSeq[i]` pages for the i-th print; records each html. */
  function harness(pageSeq: number[]) {
    const htmls: string[] = [];
    let i = 0;
    return {
      htmls,
      log: vi.fn(),
      print: async (html: string) => {
        htmls.push(html);
        return Buffer.from(`pdf${i++}`);
      },
      countPages: (pdf: Buffer) => pageSeq[Number(pdf.toString().slice(3))] ?? pageSeq[pageSeq.length - 1],
    };
  }
  const sizeOf = (html: string) => /--rz-size:([\d.]+)pt/.exec(html)?.[1];

  it("prints once and does not log when the first print fits", async () => {
    const h = harness([1]);
    const r = await exportResumePdf({ doc }, { ...h, maxFitSteps: 3 });
    expect(h.htmls).toHaveLength(1);
    expect(r).toMatchObject({ pages: 1, step: 0, startStep: 0, fits: true });
    expect(h.log).not.toHaveBeenCalled();
  });

  it("steps down until the page count fits, and logs the mismatch", async () => {
    const h = harness([3, 2, 1]);
    const r = await exportResumePdf({ doc }, { ...h, maxFitSteps: 3 });
    expect(h.htmls).toHaveLength(3);
    expect(h.htmls.map(sizeOf)).toEqual(["11", "10.5", "10.5"]); // ladder steps 0, 1, 2
    expect(r).toMatchObject({ pages: 1, step: 2, startStep: 0, fits: true });
    expect(h.log).toHaveBeenCalledWith("resume.fit.mismatch", expect.objectContaining({ startStep: 0, finalStep: 2, firstPages: 3, finalPages: 1, fits: true }));
  });

  it("steps down at most maxFitSteps times, then returns the best it has (fits:false)", async () => {
    const h = harness([2]);
    const r = await exportResumePdf({ doc }, { ...h, maxFitSteps: 3 });
    expect(h.htmls).toHaveLength(4); // the first print + 3 steps
    expect(r).toMatchObject({ pages: 2, step: 3, fits: false });
    expect(h.log).toHaveBeenCalledWith("resume.fit.mismatch", expect.objectContaining({ fits: false }));
  });

  it("never steps past the last rung", async () => {
    const h = harness([2]);
    const r = await exportResumePdf({ doc, theme: { fit: { mode: "auto", target: 1, step: 5 } } }, { ...h, maxFitSteps: 3 });
    expect(h.htmls).toHaveLength(2); // 5 -> 6, then the ladder ends
    expect(r.step).toBe(6);
  });

  it("honours a 2-page target", async () => {
    const h = harness([3, 2]);
    const r = await exportResumePdf({ doc, theme: { fit: { mode: "auto", target: 2, step: 0 } } }, { ...h, maxFitSteps: 3 });
    expect(r).toMatchObject({ pages: 2, step: 1, target: 2, fits: true });
  });

  it("leaves manual mode alone", async () => {
    const h = harness([3]);
    const r = await exportResumePdf({ doc, theme: { fit: { mode: "manual", target: 1, step: 2 } } }, { ...h, maxFitSteps: 3 });
    expect(h.htmls).toHaveLength(1);
    expect(r).toMatchObject({ pages: 3, step: 2, fits: false });
    expect(h.log).not.toHaveBeenCalled();
  });

  it("with no step budget it prints exactly once", async () => {
    const h = harness([2]);
    await exportResumePdf({ doc }, { ...h, maxFitSteps: 0 });
    expect(h.htmls).toHaveLength(1);
  });
});

describe("pdfFileName", () => {
  it("makes a safe ASCII name", () => {
    expect(pdfFileName("Jane Doe - Backend / SWE", "resume-1")).toBe("Jane-Doe-Backend-SWE.pdf");
    expect(pdfFileName("../../etc/passwd", "resume-1")).toBe("etcpasswd.pdf");
    expect(pdfFileName("Zoë Ångström", "resume-1")).toBe("Zoe-Angstrom.pdf");
  });
  it("falls back when nothing is left", () => {
    expect(pdfFileName("日本語", "resume-7")).toBe("resume-7.pdf");
    expect(pdfFileName(null, "resume-7")).toBe("resume-7.pdf");
  });
});
