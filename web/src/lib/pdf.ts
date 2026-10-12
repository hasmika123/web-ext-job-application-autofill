/**
 * Resume PDF export (Resume Builder R0.6, DESIGN 3.6): Chromium prints the SAME markup the editor
 * previews. Server-only (reads files, talks to a browser) - import it from route handlers only.
 *
 *   renderResumeHtml()   (doc, theme, templateId) -> one static HTML document: the template's markup
 *                        via `renderToStaticMarkup(<ResumePreview/>)` + `resume.css` inlined with the
 *                        fonts as base64 data URIs (no network needed to print).
 *   printPdf()           that HTML -> PDF bytes, through Chromium over CDP. One print at a time
 *                        (config), a short bounded queue behind it, 503 beyond.
 *   exportResumePdf()    the fit ladder on top: print, count the pages of the PDF itself, and when a
 *                        resume that should fit `target` pages does not, step the ladder down (at
 *                        most `maxFitSteps` more times) and print again.
 *
 * Which browser: `PDF_BROWSER_URL` (the `chromium` Compose sidecar, e.g. `ws://chromium:3000`) when
 * set; otherwise a locally installed Chromium-family browser is launched through `playwright-core`
 * (`channel: "msedge"` then `"chrome"`; nothing is downloaded) - the local-dev fallback.
 *
 * Safety of the print page: JavaScript is disabled in its context and every network request is
 * aborted - the markup is escaped text (React) plus data: fonts, so nothing legitimate needs either.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { createElement as CreateElement } from "react";
import type { renderToStaticMarkup as RenderToStaticMarkup } from "react-dom/server";
import { MAX_FIT_STEP, ResumePreview, clampStep, sanitizeTheme } from "@kiwiply/ui";
import type { PageSize, ResumeDocument, ResumeTheme } from "@kiwiply/ui";

/* ── config ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Tunables, each with a safe default. They are read from env now and named like the admin settings
 * keys they will become; the settings registry (ADMIN A5.1) does not exist yet. When it does, only
 * `readPdfConfig` changes (settings value first, env second, default last) - callers keep using
 * `PdfConfig`. Nothing else in this module hard-codes a number.
 */
export const PDF_SETTINGS = {
  timeoutMs: { key: "resume.pdf.timeoutMs", env: "RESUME_PDF_TIMEOUT_MS", default: 20_000, min: 1_000, max: 120_000 },
  maxConcurrent: { key: "resume.pdf.maxConcurrent", env: "RESUME_PDF_MAX_CONCURRENT", default: 1, min: 1, max: 8 },
  queueMax: { key: "resume.pdf.queueMax", env: "RESUME_PDF_QUEUE_MAX", default: 10, min: 0, max: 100 },
  maxFitSteps: { key: "resume.pdf.maxFitSteps", env: "RESUME_PDF_MAX_FIT_STEPS", default: 3, min: 0, max: MAX_FIT_STEP },
} as const;

export interface PdfConfig {
  /** `PDF_BROWSER_URL`: the CDP endpoint of the sidecar. Empty = launch a local browser (dev). */
  browserUrl: string;
  /** `PDF_LOCAL_CHANNEL`: which installed browser to launch without a sidecar. Empty = msedge, then chrome. */
  localChannel: string;
  timeoutMs: number;
  maxConcurrent: number;
  queueMax: number;
  maxFitSteps: number;
}

type Env = Record<string, string | undefined>;

function intSetting(spec: { env: string; default: number; min: number; max: number }, env: Env): number {
  const raw = env[spec.env];
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, Math.trunc(n))) : spec.default;
}

export function readPdfConfig(env: Env = process.env): PdfConfig {
  return {
    browserUrl: (env.PDF_BROWSER_URL ?? "").trim(),
    localChannel: (env.PDF_LOCAL_CHANNEL ?? "").trim(),
    timeoutMs: intSetting(PDF_SETTINGS.timeoutMs, env),
    maxConcurrent: intSetting(PDF_SETTINGS.maxConcurrent, env),
    queueMax: intSetting(PDF_SETTINGS.queueMax, env),
    maxFitSteps: intSetting(PDF_SETTINGS.maxFitSteps, env),
  };
}

/* ── errors the route maps to HTTP ────────────────────────────────────────────────────────── */

/** Every print slot is taken and the queue is full -> 503 + Retry-After. */
export class PdfBusyError extends Error {
  constructor() {
    super("The PDF service is busy.");
    this.name = "PdfBusyError";
  }
}

/** No browser to print with (sidecar unreachable, or no local browser in dev) -> 503. */
export class PdfUnavailableError extends Error {
  constructor(message = "PDF export needs the pdf service.") {
    super(message);
    this.name = "PdfUnavailableError";
  }
}

/** A print exceeded `resume.pdf.timeoutMs` -> 504. */
export class PdfTimeoutError extends Error {
  constructor(ms: number) {
    super(`The PDF took longer than ${ms} ms.`);
    this.name = "PdfTimeoutError";
  }
}

/* ── concurrency: N at a time + a bounded wait queue ──────────────────────────────────────── */

export interface Limiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly running: number;
  readonly waiting: number;
}

/**
 * At most `concurrency` jobs run; up to `queueMax` more wait (FIFO); beyond that `run` rejects with
 * `PdfBusyError` immediately. In memory and per process - the web app is one long-running container.
 */
export function createLimiter(concurrency: number, queueMax: number): Limiter {
  let running = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    const next = queue.shift();
    if (next) next(); // hand the slot straight over: `running` stays the same
    else running -= 1;
  };

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (running >= concurrency) {
        if (queue.length >= queueMax) throw new PdfBusyError();
        await new Promise<void>((resolve) => queue.push(resolve));
      } else {
        running += 1;
      }
      try {
        return await fn();
      } finally {
        release();
      }
    },
    get running() {
      return running;
    },
    get waiting() {
      return queue.length;
    },
  };
}

let sharedLimiter: Limiter | null = null;
function limiter(): Limiter {
  if (!sharedLimiter) {
    const cfg = readPdfConfig();
    sharedLimiter = createLimiter(cfg.maxConcurrent, cfg.queueMax);
  }
  return sharedLimiter;
}

/** Test seam: forget the shared limiter so the next print re-reads the config. */
export function resetPdfLimiter(): void {
  sharedLimiter = null;
}

/* ── HTML ─────────────────────────────────────────────────────────────────────────────────── */

export interface RenderInput {
  doc: ResumeDocument;
  theme?: Partial<ResumeTheme> | null;
  templateId?: string | null;
}

/**
 * Next refuses `import "react-dom/server"` anywhere in the server (RSC) module graph - even in a
 * route handler, where it is perfectly legitimate - and bundling it there would give it the RSC
 * build of `react`, which it cannot run on. So load `react` + `react-dom/server` as ordinary Node
 * modules from node_modules (resolved from the server's cwd, `web/`; the file tracer is told about
 * them in next.config). The templates use no hooks, so elements built by any copy of React render.
 */
const nodeRequire = createRequire(path.join(process.cwd(), "noop.js"));
let reactCache: { createElement: typeof CreateElement; renderToStaticMarkup: typeof RenderToStaticMarkup } | null = null;
function react() {
  reactCache ??= {
    createElement: (nodeRequire("react") as { createElement: typeof CreateElement }).createElement,
    renderToStaticMarkup: (nodeRequire("react-dom/server") as { renderToStaticMarkup: typeof RenderToStaticMarkup }).renderToStaticMarkup,
  };
  return reactCache;
}

let cachedUiRoot: string | null = null;

/**
 * `packages/ui`, found from the server's working directory: `web/` in dev, `<standalone>/web` in the
 * image (`outputFileTracingIncludes` in next.config copies the CSS + fonts next to it), so the
 * package is always at `../packages/ui`. `PDF_UI_ROOT` overrides for odd layouts.
 */
function uiRoot(): string {
  if (cachedUiRoot) return cachedUiRoot;
  const candidates = [process.env.PDF_UI_ROOT, path.resolve(process.cwd(), "../packages/ui"), path.resolve(process.cwd(), "packages/ui")].filter(
    (c): c is string => !!c,
  );
  for (const c of candidates) {
    try {
      readFileSync(path.join(c, "styles", "resume.css"));
      cachedUiRoot = c;
      return c;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(`resume.css not found (looked in ${candidates.join(", ")})`);
}

let cachedCss: string | null = null;

/** `resume.css` with every `url("../fonts/x.woff2")` replaced by a base64 data URI. Cached. */
export function resumeCss(): string {
  if (cachedCss !== null) return cachedCss;
  const root = uiRoot();
  const css = readFileSync(path.join(root, "styles", "resume.css"), "utf8");
  cachedCss = css.replace(/url\(\s*["']?\.\.\/fonts\/([\w.-]+\.woff2)["']?\s*\)/g, (_m, file: string) => {
    const b64 = readFileSync(path.join(root, "fonts", file)).toString("base64");
    return `url(data:font/woff2;base64,${b64})`;
  });
  return cachedCss;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * One self-contained HTML document for a resume. `step` overrides the theme's stored ladder step
 * (the export loop uses it); everything else is exactly what `PreviewPane` shows. Pure apart from
 * the one-time read of the CSS + fonts.
 */
export function renderResumeHtml(input: RenderInput, opts: { step?: number } = {}): string {
  const base = sanitizeTheme(input.theme);
  const theme = opts.step === undefined ? base : { ...base, fit: { ...base.fit, step: clampStep(opts.step) } };
  const { createElement, renderToStaticMarkup } = react();
  const markup = renderToStaticMarkup(createElement(ResumePreview, { doc: input.doc, theme, templateId: input.templateId }));
  const title = escapeHtml(input.doc.meta?.title || "Resume");
  const lang = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(input.doc.meta?.language ?? "") ? input.doc.meta?.language : "en";
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>` +
    `<style>${resumeCss()}</style><style>html,body{margin:0;padding:0;background:#fff}</style>` +
    `</head><body>${markup}</body></html>`
  );
}

/* ── printing ─────────────────────────────────────────────────────────────────────────────── */

// Narrow structural types: keep `playwright-core` out of the type surface (and out of tests).
interface PwPage {
  route(url: string, handler: (route: { abort(): Promise<void> }) => unknown): Promise<void>;
  setContent(html: string, opts?: { waitUntil?: "load"; timeout?: number }): Promise<void>;
  evaluate(fn: () => unknown): Promise<unknown>;
  emulateMedia(opts: { media: "print" }): Promise<void>;
  pdf(opts: Record<string, unknown>): Promise<Buffer>;
  setDefaultTimeout(ms: number): void;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(opts: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
}

async function openBrowser(cfg: PdfConfig): Promise<PwBrowser> {
  const { chromium } = await import("playwright-core");
  if (cfg.browserUrl) {
    try {
      return (await chromium.connectOverCDP(cfg.browserUrl, { timeout: Math.min(cfg.timeoutMs, 10_000) })) as unknown as PwBrowser;
    } catch (e) {
      throw new PdfUnavailableError(`Couldn't reach the PDF service (${(e as Error).message.split("\n")[0]}).`);
    }
  }
  const channels = cfg.localChannel ? [cfg.localChannel] : ["msedge", "chrome"];
  let last: Error | null = null;
  for (const channel of channels) {
    try {
      return (await chromium.launch({ channel, headless: true })) as unknown as PwBrowser;
    } catch (e) {
      last = e as Error;
    }
  }
  throw new PdfUnavailableError(`PDF export needs the pdf service (PDF_BROWSER_URL) or a local Edge/Chrome. ${last?.message.split("\n")[0] ?? ""}`.trim());
}

/**
 * What `page.pdf` gets: the stylesheet's `@page` rule wins (size + margins, `preferCSSPageSize`);
 * `format` is only the fallback if that rule were ever missing.
 */
function pdfOptions(pageSize: PageSize): Record<string, unknown> {
  return { preferCSSPageSize: true, printBackground: true, format: pageSize === "a4" ? "A4" : "Letter" };
}

async function printOnce(html: string, pageSize: PageSize, cfg: PdfConfig): Promise<Buffer> {
  const browser = await openBrowser(cfg);
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(cfg.timeoutMs);
      await page.route("**/*", (route) => route.abort());
      await page.setContent(html, { waitUntil: "load", timeout: cfg.timeoutMs });
      await page.emulateMedia({ media: "print" });
      return await page.pdf(pdfOptions(pageSize));
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * HTML -> PDF bytes. Takes a print slot (waits in the bounded queue, or `PdfBusyError`), then
 * prints with a hard `timeoutMs` ceiling (`PdfTimeoutError`). The page size comes from the
 * stylesheet's `@page` rule (`preferCSSPageSize`), which the theme sets; `pageSize` is the fallback.
 */
export async function printPdf(html: string, opts: { pageSize?: PageSize } = {}): Promise<Buffer> {
  const cfg = readPdfConfig();
  return limiter().run(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ceiling = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PdfTimeoutError(cfg.timeoutMs)), cfg.timeoutMs + 2_000);
    });
    try {
      return await Promise.race([printOnce(html, opts.pageSize ?? "letter", cfg), ceiling]);
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * Page count of a PDF, from its page objects. Chromium (Skia) writes object dictionaries
 * uncompressed, so `/Type /Page` (not `/Pages`) occurs once per page. No parser dependency.
 */
export function countPdfPages(pdf: Uint8Array | Buffer): number {
  const text = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString("latin1");
  const n = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
  return Math.max(1, n);
}

/* ── the fit ladder, measured in Chromium ─────────────────────────────────────────────────── */

export interface ExportResult {
  pdf: Buffer;
  pages: number;
  /** The ladder step the PDF was printed at. */
  step: number;
  /** The step stored in the theme (what the preview showed). */
  startStep: number;
  /** Pages wanted (`theme.fit.target`). */
  target: number;
  /** `pages <= target`. False = the ladder (or the step budget) ran out: "Still N pages". */
  fits: boolean;
}

export interface ExportDeps {
  print?: (html: string, opts: { pageSize: PageSize }) => Promise<Buffer>;
  countPages?: (pdf: Buffer) => number;
  log?: (event: string, fields: Record<string, unknown>) => void;
  maxFitSteps?: number;
}

/**
 * Prints the resume at the stored ladder step; in `auto` mode, while the PDF has more pages than
 * `target`, steps the ladder down (at most `maxFitSteps` times, never past the last rung) and prints
 * again. The preview and Chromium can disagree by a line; the PDF's own page count is the truth, and
 * a disagreement is logged as `resume.fit.mismatch`.
 */
export async function exportResumePdf(input: RenderInput, deps: ExportDeps = {}): Promise<ExportResult> {
  const print = deps.print ?? ((html, o) => printPdf(html, o));
  const count = deps.countPages ?? countPdfPages;
  const log = deps.log ?? ((event, fields) => console.warn(JSON.stringify({ event, ...fields })));
  const maxExtra = deps.maxFitSteps ?? readPdfConfig().maxFitSteps;

  const base = sanitizeTheme(input.theme);
  const target = Math.max(1, Math.trunc(base.fit.target ?? 1));
  const startStep = clampStep(base.fit.step);
  const auto = base.fit.mode === "auto";

  let step = startStep;
  let extra = 0;
  let firstPages: number | null = null;
  for (;;) {
    const pdf = await print(renderResumeHtml(input, { step }), { pageSize: base.pageSize });
    const pages = count(pdf);
    firstPages ??= pages;
    const done = pages <= target || !auto || extra >= maxExtra || step >= MAX_FIT_STEP;
    if (done) {
      if (firstPages > target && auto) {
        log("resume.fit.mismatch", { startStep, finalStep: step, target, firstPages, finalPages: pages, fits: pages <= target });
      }
      return { pdf, pages, step, startStep, target, fits: pages <= target };
    }
    step += 1;
    extra += 1;
  }
}
