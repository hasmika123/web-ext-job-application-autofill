/**
 * The async resume-PDF worker (Resume Builder R3.7, DESIGN 8.5). Server-only.
 *
 * Every save of a built resume leaves a PENDING marker on its `resume_doc` row. The web process owns the
 * Chromium client (`lib/pdf.ts`), so the worker lives here: it polls Spring's internal queue, renders the
 * claimed document with {@link exportResumePdf} (the same ladder the Export button uses) and posts the bytes
 * back, where Spring stores them through `FileStorage` as the resume's file - the object the extension attaches.
 *
 *   POST /api/internal/resume-pdf-jobs/claim {worker, limit}   -> [{resumeId, userId, renderHash, templateId}]
 *   GET  /api/internal/resumes/:id/doc                         -> ResumeDocDTO (by id; no user)
 *   POST /api/internal/resumes/:id/pdf (multipart: file, renderHash, pages, fits, thumb?) -> 204 (Spring discards it if the document moved on)
 *   POST /api/internal/resume-pdf-jobs/:id/fail {kind, ...}    -> 204   kind: BUSY | TIMEOUT | ERROR
 *
 * All four carry `X-Internal-Token` (= `DOSSIER_INTERNAL_TOKEN`); they are reachable only on the Compose network.
 *
 * Switched on by `RESUME_PDF_WORKER=1` (exactly one web container sets it in Compose; several would be safe,
 * since claims are leased). Without it - or without the token - `startPdfWorker` does nothing at all.
 *
 * Intervals are settings, not constants: the poll interval comes back from Spring on every claim
 * (`X-Pdf-Poll-Ms` = `resume.pdf.pollMs`); `FALLBACK_POLL_MS` only covers the time before the first answer, and
 * an unreachable API. Render limits (`resume.pdf.timeoutMs`, `maxConcurrent`, `queueMax`) stay in `lib/pdf.ts`.
 */
import os from "node:os";
import { apiUrl } from "@/lib/config";
import { PdfBusyError, PdfTimeoutError, exportResumePdf, readPdfConfig } from "@/lib/pdf";
import type { ExportResult, RenderInput } from "@/lib/pdf";

/** Mirrors the API's declared default for `resume.pdf.pollMs`; used until Spring has answered once. */
export const FALLBACK_POLL_MS = 5_000;

export type PdfFailKind = "BUSY" | "TIMEOUT" | "ERROR";

export interface PdfJob {
  resumeId: number;
  userId: number;
  renderHash: string;
  templateId: string;
  /** `resume.thumb.width` (a setting): how wide the card thumbnail is; absent from an API without R3.13 = no thumbnail. */
  thumbWidth?: number;
}

type Env = Record<string, string | undefined>;
type Level = "info" | "warn" | "error";

export interface WorkerDeps {
  fetch?: typeof fetch;
  exportPdf?: (input: RenderInput, opts?: { thumbWidth?: number }) => Promise<Pick<ExportResult, "pdf" | "pages" | "fits"> & { thumb?: Buffer | null }>;
  env?: Env;
  log?: (level: Level, line: string) => void;
  now?: () => number;
  /** Worker identity for leases; defaults to `web-<hostname>-<pid>`. */
  workerId?: string;
  /** Per-request ceiling for calls to Spring. Defaults to the render timeout. */
  requestTimeoutMs?: number;
}

export interface RunResult {
  /** Jobs claimed (and processed) on this pass. */
  jobs: number;
  /** How long to wait before the next pass. */
  pollMs: number;
}

const defaultLog = (level: Level, line: string) => console[level](line);

function internalHeaders(token: string, json: boolean): Record<string, string> {
  return json ? { "x-internal-token": token, "content-type": "application/json" } : { "x-internal-token": token };
}

/** Maps a render error to the kind Spring understands: 503 busy -> BUSY (no attempt counted), timeout -> TIMEOUT, rest -> ERROR. */
export function failKindOf(e: unknown): PdfFailKind {
  if (e instanceof PdfBusyError) return "BUSY";
  if (e instanceof PdfTimeoutError) return "TIMEOUT";
  return "ERROR";
}

/**
 * One pass: claim at most one job, render it, post the result. Never throws - every failure is reported to
 * Spring (`/fail`) or logged, and the pass still returns the interval to wait.
 */
export async function runPdfJobsOnce(deps: WorkerDeps = {}): Promise<RunResult> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetch ?? fetch;
  const doExport = deps.exportPdf ?? ((input: RenderInput, opts?: { thumbWidth?: number }) => exportResumePdf(input, {}, opts));
  const log = deps.log ?? defaultLog;
  const now = deps.now ?? Date.now;
  const token = (env.DOSSIER_INTERNAL_TOKEN ?? "").trim();
  const worker = deps.workerId ?? workerIdFor(env);
  const timeoutMs = deps.requestTimeoutMs ?? readPdfConfig(env).timeoutMs;
  const signal = () => AbortSignal.timeout(timeoutMs);
  let pollMs = FALLBACK_POLL_MS;

  let jobs: PdfJob[];
  try {
    const res = await doFetch(apiUrl("/api/internal/resume-pdf-jobs/claim"), {
      method: "POST",
      headers: internalHeaders(token, true),
      body: JSON.stringify({ worker, limit: 1 }),
      cache: "no-store",
      signal: signal(),
    });
    const hinted = Number(res.headers.get("x-pdf-poll-ms"));
    if (Number.isFinite(hinted) && hinted > 0) pollMs = hinted;
    if (!res.ok) {
      log("warn", `pdf-worker claim answered ${res.status}`);
      return { jobs: 0, pollMs };
    }
    const body: unknown = await res.json();
    jobs = Array.isArray(body) ? (body as PdfJob[]) : [];
  } catch (e) {
    log("warn", `pdf-worker could not claim: ${(e as Error).message}`);
    return { jobs: 0, pollMs };
  }

  for (const job of jobs) {
    const started = now();
    const reportFailure = async (kind: PdfFailKind, message: string) => {
      log("warn", `pdf-job ${job.resumeId} ${kind} ms=${now() - started}: ${message}`);
      try {
        await doFetch(apiUrl(`/api/internal/resume-pdf-jobs/${job.resumeId}/fail`), {
          method: "POST",
          headers: internalHeaders(token, true),
          body: JSON.stringify({ kind, message: message.slice(0, 200), worker }),
          cache: "no-store",
          signal: signal(),
        });
      } catch (e) {
        // The lease will expire and the job becomes claimable again; nothing more to do from here.
        log("error", `pdf-job ${job.resumeId} could not report ${kind}: ${(e as Error).message}`);
      }
    };

    try {
      const docRes = await doFetch(apiUrl(`/api/internal/resumes/${job.resumeId}/doc`), {
        headers: internalHeaders(token, false),
        cache: "no-store",
        signal: signal(),
      });
      if (!docRes.ok) {
        await reportFailure("ERROR", `document answered ${docRes.status}`);
        continue;
      }
      const dto = (await docRes.json()) as { doc?: RenderInput["doc"]; theme?: RenderInput["theme"]; templateId?: string; renderHash?: string };
      if (!dto.doc) {
        await reportFailure("ERROR", "document answered without a body");
        continue;
      }

      const thumbWidth = Number.isFinite(job.thumbWidth) && (job.thumbWidth as number) > 0 ? Math.trunc(job.thumbWidth as number) : undefined;
      const result = await doExport({ doc: dto.doc, theme: dto.theme ?? null, templateId: dto.templateId ?? job.templateId }, { thumbWidth });

      // Post what was actually rendered: if the document moved on since the claim, Spring still stores this
      // when it is the current render, and discards it (204) otherwise.
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(result.pdf)], { type: "application/pdf" }), `resume-${job.resumeId}.pdf`);
      form.set("renderHash", dto.renderHash || job.renderHash);
      form.set("pages", String(result.pages));
      form.set("fits", result.fits ? "true" : "false");
      // The card thumbnail (R3.13): the first page as a PNG, taken from the same page right after the PDF. Optional.
      if (result.thumb && result.thumb.length > 0) form.set("thumb", new Blob([new Uint8Array(result.thumb)], { type: "image/png" }), `resume-${job.resumeId}.png`);
      const up = await doFetch(apiUrl(`/api/internal/resumes/${job.resumeId}/pdf`), {
        method: "POST",
        headers: internalHeaders(token, false),
        body: form,
        cache: "no-store",
        signal: signal(),
      });
      if (!up.ok) {
        await reportFailure("ERROR", `store answered ${up.status}`);
        continue;
      }
      log("info", `pdf-job ${job.resumeId} ready pages=${result.pages} ms=${now() - started}`);
    } catch (e) {
      await reportFailure(failKindOf(e), (e as Error).message || String(e));
    }
  }
  return { jobs: jobs.length, pollMs };
}

function workerIdFor(env: Env): string {
  const explicit = (env.RESUME_PDF_WORKER_ID ?? "").trim();
  return explicit || `web-${os.hostname()}-${process.pid}`;
}

export interface PdfWorkerHandle {
  stop(): void;
}

const GLOBAL_KEY = Symbol.for("kiwiply.resumePdfWorker");

/**
 * Starts the polling loop when `RESUME_PDF_WORKER=1` and `DOSSIER_INTERNAL_TOKEN` is set; returns `null` (and
 * schedules nothing) otherwise. Called from `instrumentation.ts` at server start. Idempotent per process, so a
 * dev-server reload does not stack loops.
 */
export function startPdfWorker(deps: WorkerDeps = {}): PdfWorkerHandle | null {
  const env = deps.env ?? process.env;
  if (env.RESUME_PDF_WORKER !== "1") return null;
  const log = deps.log ?? defaultLog;
  if (!(env.DOSSIER_INTERNAL_TOKEN ?? "").trim()) {
    log("error", "pdf-worker is enabled (RESUME_PDF_WORKER=1) but DOSSIER_INTERNAL_TOKEN is not set; not starting");
    return null;
  }
  const g = globalThis as unknown as Record<symbol, PdfWorkerHandle | undefined>;
  const existing = g[GLOBAL_KEY];
  if (existing) return existing;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    let next = FALLBACK_POLL_MS;
    try {
      const r = await runPdfJobsOnce(deps);
      // A pass that found work asks again at once: a burst drains without waiting a poll interval per job.
      next = r.jobs > 0 ? 0 : r.pollMs;
    } catch (e) {
      log("error", `pdf-worker pass failed: ${(e as Error).message}`);
    }
    if (stopped) return;
    timer = setTimeout(() => void tick(), next);
    timer.unref?.();
  };

  const handle: PdfWorkerHandle = {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      delete g[GLOBAL_KEY];
    },
  };
  g[GLOBAL_KEY] = handle;
  log("info", `pdf-worker started (${deps.workerId ?? workerIdFor(env)})`);
  timer = setTimeout(() => void tick(), 0);
  timer.unref?.();
  return handle;
}
