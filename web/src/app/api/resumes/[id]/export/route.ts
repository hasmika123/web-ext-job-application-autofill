import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { RESUME_ID, badId } from "@/lib/resume-doc-proxy";
import { downloadFileName, pdfFileName } from "@/lib/pdf-name";
import { PdfBusyError, PdfTimeoutError, PdfUnavailableError, countPdfPages, exportResumePdf, resolvePhotoSrc } from "@/lib/pdf";
import { resumeContentHash, resumeRenderHash, sanitizeTheme } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";

// playwright-core + fs: Node runtime, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DocDto {
  doc: ResumeDocument;
  theme: Partial<ResumeTheme> | null;
  templateId: string;
  contentHash: string | null;
  /** sha256(contentHash|templateId|theme): what the PDF would be rendered from now (R3.7). Absent on older APIs. */
  renderHash?: string | null;
  /** The stored PDF's state; `hash` is the render hash it was made from. */
  pdf?: { status?: string; hash?: string | null } | null;
  label: string;
}

const unauthorized = () => Response.json({ error: "You're not signed in." }, { status: 401 });

async function loadDoc(id: string): Promise<{ dto: DocDto } | { error: Response }> {
  let docRes: Response;
  try {
    docRes = await serverApiFetch(`/api/profile/resumes/${id}/doc`);
  } catch {
    return { error: Response.json({ error: "Couldn't reach the server." }, { status: 502 }) };
  }
  if (!docRes.ok) {
    return { error: Response.json({ error: docRes.status === 404 ? "That resume is no longer there." : "Couldn't load the resume." }, { status: docRes.status }) };
  }
  const dto = (await docRes.json().catch(() => null)) as DocDto | null;
  if (!dto?.doc) return { error: Response.json({ error: "Couldn't load the resume." }, { status: 502 }) };
  return { dto };
}

/**
 * GET /api/resumes/:id/export?format=txt  (DESIGN 14, R2.10): the document as plain text, proxied from
 * Spring's `/doc/text` and served as a download. Reads only: no PDF, nothing stored or recorded.
 * Dispatched from {@link GET} below, next to the R3.7 stored-PDF read.
 */
async function exportText(request: Request, id: string): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return Response.json({ error: "You're not signed in." }, { status: 401 });

  const limited = rateLimit(request, "resume-export-txt", 30, 60_000);
  if (!limited.ok) {
    return Response.json(
      { error: "Too many downloads - try again in a moment.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  let textRes: Response;
  let docRes: Response;
  try {
    [textRes, docRes] = await Promise.all([
      serverApiFetch(`/api/profile/resumes/${id}/doc/text`),
      serverApiFetch(`/api/profile/resumes/${id}/doc`),
    ]);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!textRes.ok) {
    return Response.json(
      { error: textRes.status === 404 ? "That resume is no longer there." : "Couldn't load the resume." },
      { status: textRes.status },
    );
  }
  const label = docRes.ok ? ((await docRes.json().catch(() => null)) as { label?: string } | null)?.label : undefined;
  const text = await textRes.text();
  const fileName = downloadFileName(label, `resume-${id}`, "txt");
  return new Response(text, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}

/**
 * POST /api/resumes/:id/export  {format:"pdf"}  (DESIGN 6.4, 8.5)
 *
 * Loads the saved document from Spring, has Chromium print the same HTML the editor previews
 * (stepping the fit ladder down if Chromium needs more pages than the target), then:
 *   1. uploads the PDF to Spring `POST /api/resumes/:id/file` (stored through the FileStorage seam,
 *      so the extension can attach it), and
 *   2. records the export (`POST /api/profile/resumes/:id/export-recorded {hash}`) with the document's
 *      RENDER hash, which marks the resume's PDF job READY when the document has not moved on.
 * and streams the PDF back as a download. A failed store does not fail the download: the user still
 * gets the file, `X-Resume-Pdf-Stored: 0` says it was not attached, and nothing is recorded.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();

  const body = (await request.json().catch(() => null)) as { format?: unknown } | null;
  if (body?.format !== "pdf") {
    return Response.json({ error: 'Only {"format":"pdf"} is supported.', code: "FORMAT_UNSUPPORTED" }, { status: 400 });
  }

  const token = await getAccessToken();
  if (!token) return unauthorized();
  return renderAndStore(request, id, token);
}

/**
 * GET /api/resumes/:id/export?format=pdf&cached=1  (DESIGN 8.4, 8.5)
 *
 * The PDF view / Download PDF path: when the stored PDF is READY and was made from the document's current
 * render hash, stream the stored object - no Chromium call. Otherwise fall through to exactly what POST does
 * (render synchronously, store through the same path, mark READY), so the worker has nothing left to do.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "txt") return exportText(request, id); // R2.10
  if (url.searchParams.get("format") !== "pdf" || url.searchParams.get("cached") !== "1") {
    return Response.json({ error: "Use ?format=txt or ?format=pdf&cached=1 (or POST to render).", code: "FORMAT_UNSUPPORTED" }, { status: 400 });
  }

  const token = await getAccessToken();
  if (!token) return unauthorized();

  const loaded = await loadDoc(id);
  if ("error" in loaded) return loaded.error;
  const { dto } = loaded;

  if (dto.pdf?.status === "READY" && dto.renderHash && dto.pdf.hash === dto.renderHash) {
    try {
      const stored = await serverApiFetch(`/api/resumes/${id}/file`);
      if (stored.ok) {
        const bytes = new Uint8Array(await stored.arrayBuffer());
        const fileName = pdfFileName(dto.label, `resume-${id}`);
        const pages = countPdfPages(bytes);
        const target = Math.max(1, Math.trunc(sanitizeTheme(dto.theme).fit.target ?? 1));
        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="${fileName}"`,
            "content-length": String(bytes.length),
            "cache-control": "no-store",
            "x-resume-pdf-cached": "1",
            "x-resume-pdf-pages": String(pages),
            "x-resume-pdf-fits": pages <= target ? "1" : "0",
            "x-resume-pdf-stored": "1",
            "x-resume-content-hash": dto.contentHash ?? "",
            "x-resume-render-hash": dto.renderHash,
          },
        });
      }
      console.warn("resume.export.cached_miss", stored.status); // the object is gone: render it again below
    } catch (e) {
      console.warn("resume.export.cached_miss", e);
    }
  }
  return renderAndStore(request, id, token, dto);
}

/** Renders the saved document, stores the PDF on the resume and answers with the file. */
async function renderAndStore(request: Request, id: string, token: string, preloaded?: DocDto): Promise<Response> {
  const limited = rateLimit(request, "resume-export", 10, 60_000);
  if (!limited.ok) {
    return Response.json(
      { error: "Too many exports - try again in a moment.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  // 1) The saved document (ownership is Spring's: someone else's id is a 404 here too).
  let dto = preloaded;
  if (!dto) {
    const loaded = await loadDoc(id);
    if ("error" in loaded) return loaded.error;
    dto = loaded.dto;
  }
  const hash = dto.contentHash || (await resumeContentHash(dto.doc));
  // What the stored PDF will be judged against. Spring computes it; the TS twin covers an API that does not.
  const renderHash = dto.renderHash || (await resumeRenderHash(hash, dto.templateId, dto.theme ?? {}));

  // 2) Print.
  const started = Date.now();
  let result;
  try {
    // The photo (R7.4) travels inside the HTML as a data URI - the print page has no network - and only when this template would draw it.
    const photoSrc = await resolvePhotoSrc({ doc: dto.doc, theme: dto.theme, templateId: dto.templateId }, async () => {
      const photo = await serverApiFetch(`/api/profile/resumes/${id}/photo`);
      return photo.ok ? { bytes: new Uint8Array(await photo.arrayBuffer()), contentType: photo.headers.get("content-type") } : null;
    });
    result = await exportResumePdf({ doc: dto.doc, theme: dto.theme, templateId: dto.templateId, ...(photoSrc ? { photoSrc } : {}) });
  } catch (e) {
    if (e instanceof PdfBusyError) {
      return Response.json({ error: "The PDF service is busy - try again in a few seconds.", code: "PDF_BUSY" }, { status: 503, headers: { "retry-after": "5" } });
    }
    if (e instanceof PdfUnavailableError) {
      console.error("resume.export.unavailable", e.message);
      return Response.json({ error: "PDF export needs the pdf service, which isn't reachable right now.", code: "PDF_UNAVAILABLE" }, { status: 503, headers: { "retry-after": "30" } });
    }
    if (e instanceof PdfTimeoutError) {
      console.error("resume.export.timeout", e.message);
      return Response.json({ error: "The PDF took too long to make. Please try again.", code: "PDF_TIMEOUT" }, { status: 504 });
    }
    console.error("resume.export.failed", e);
    return Response.json({ error: "Couldn't make the PDF. Please try again.", code: "PDF_FAILED" }, { status: 500 });
  }
  const fileName = pdfFileName(dto.label, `resume-${id}`);
  console.info(
    JSON.stringify({
      event: "resume.export.pdf",
      resumeId: Number(id),
      pages: result.pages,
      step: result.step,
      startStep: result.startStep,
      ms: Date.now() - started,
      bytes: result.pdf.length,
    }),
  );

  // 3) Store it and record the export (best effort: the download below does not depend on it).
  let stored = false;
  try {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(result.pdf)], { type: "application/pdf" }), fileName);
    const up = await fetch(apiUrl(`/api/resumes/${id}/file`), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store",
    });
    if (up.ok) {
      const rec = await serverApiFetch(`/api/profile/resumes/${id}/export-recorded`, { method: "POST", body: JSON.stringify({ hash: renderHash }) });
      stored = rec.ok;
      if (!rec.ok) console.error("resume.export.record_failed", rec.status);
    } else {
      console.error("resume.export.store_failed", up.status);
    }
  } catch (e) {
    console.error("resume.export.store_failed", e);
  }

  return new Response(new Uint8Array(result.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-length": String(result.pdf.length),
      "cache-control": "no-store",
      "x-resume-pdf-pages": String(result.pages),
      "x-resume-pdf-fits": result.fits ? "1" : "0",
      "x-resume-pdf-stored": stored ? "1" : "0",
      "x-resume-content-hash": hash,
      "x-resume-render-hash": renderHash,
    },
  });
}
