"use client";

import "@kiwiply/ui/styles/resume.css";
import "@kiwiply/ui/styles/resume-print.css";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync, createPortal } from "react-dom";
import {
  AlertIcon,
  Button,
  DownloadIcon,
  MAX_FIT_STEP,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  ResumePreview,
  Spinner,
  cn,
  fitScale,
  getTemplate,
  useBottomBar,
} from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";
import HiddenContentBar from "../HiddenContentBar";
import { runFitLadder } from "../lib/fitLadder";
import { longestItems } from "../lib/longestItems";
import { contentHeightOf, drawnTheme, paginate } from "../lib/paginate";
import { printResume } from "../lib/printResume";
import type { PresentationControls } from "../usePresentation";

const NUMBER_WORDS = ["zero", "one", "two"] as const;
const pageWord = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

/** Pinch-zoom range of the phone Preview (1 = fit the width). */
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export interface PrintLayoutViewProps {
  doc: ResumeDocument;
  /** The STORED theme (the page budget, spacing and ladder step are read from it). */
  theme: Partial<ResumeTheme> | null;
  templateId: string;
  /** The ACTIVE template's resolved capabilities (`maxPages` caps the page budget). */
  caps: TemplateCapabilities;
  photoSrc?: string | null;
  /** The editor's template + theme controls: "Fit to one page" stores the ladder step through `changeTheme`. */
  controls: Pick<PresentationControls, "changeTheme">;
  onDownloadPdf: () => void;
  exporting?: boolean;
  /** Edits and exports are off while a save conflict is open. */
  disabled?: boolean;
  /** Phone: zoom buttons and pinch (the page boxes are fitted to the width, 1x). */
  zoomable?: boolean;
}

/**
 * Print layout (DESIGN 10.8): the resume as the template paginates it, instantly and without the server.
 * The document is rendered ONCE in the first page box; its sheet height is measured and `paginate()`
 * (the `fit.ts` page-count rule) turns it into N page boxes, each clipping a copy of the same render at
 * its own offset. Above the pages: what the template hides, and a banner when the resume is over its page
 * budget (the stored Page Length capped by the template's `maxPages`) with "Fit to one page", which runs
 * the fit ladder and stores the step. Footer: Download PDF, Print, the page count and the template name.
 */
export default function PrintLayoutView({
  doc,
  theme,
  templateId,
  caps,
  photoSrc = null,
  controls,
  onDownloadPdf,
  exporting = false,
  disabled = false,
  zoomable = false,
}: PrintLayoutViewProps) {
  const deferredDoc = useDeferredValue(doc);
  const drawn = useMemo(() => drawnTheme(theme, caps), [theme, caps]);
  const templateName = getTemplate(templateId).meta.name;

  /* ── one measured render → page count ─────────────────────────────────────────────── */
  const measureRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const read = () => {
      const sheet = root.querySelector<HTMLElement>(".rz-page");
      if (sheet) setSheetHeight((h) => (Math.abs(h - sheet.offsetHeight) < 1 ? h : sheet.offsetHeight));
    };
    read();
    const sheet = root.querySelector<HTMLElement>(".rz-page");
    const ro = sheet && typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    if (sheet) ro?.observe(sheet);
    void document.fonts?.ready.then(read); // a web font landing late changes the height
    return () => ro?.disconnect();
  }, [deferredDoc, theme, templateId, caps]);

  const pagination = useMemo(() => paginate(contentHeightOf(sheetHeight, drawn.margin), theme, caps), [sheetHeight, drawn.margin, theme, caps]);
  const { pages, limit, over } = pagination;
  const exhausted = over && drawn.fit.step >= MAX_FIT_STEP;
  const longest = useMemo(() => (exhausted ? longestItems(doc) : []), [exhausted, doc]);

  /* ── scale to the pane (+ phone zoom) ─────────────────────────────────────────────── */
  const scrollRef = useRef<HTMLDivElement>(null);
  // The sticky Download / Print bar tells the floating bug-report button / toasts to stay above it (phones).
  const barRef = useRef<HTMLDivElement>(null);
  useBottomBar(barRef);
  const [paneWidth, setPaneWidth] = useState(0);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const read = () => setPaneWidth((w) => (w === el.clientWidth ? w : el.clientWidth));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = fitScale(paneWidth, pagination.pageWidthPx, 1, zoom);

  // Two fingers on the pages zoom them (the browser's own pinch is off for this pane: touch-action).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !zoomable) return;
    let startDistance = 0;
    let startZoom = ZOOM_MIN;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDistance = distance(e.touches);
      startZoom = zoomRef.current;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDistance <= 0) return;
      e.preventDefault();
      setZoom(clampZoom(startZoom * (distance(e.touches) / startDistance)));
    };
    const onEnd = () => {
      startDistance = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [zoomable]);
  /* ── Fit to one page: the fit ladder, measured off-screen, stored through the theme PATCH ─── */
  const [announce, setAnnounce] = useState("");
  const fit = () => {
    const result = runFitLadder({ doc, theme, templateId, caps, photoSrc });
    controls.changeTheme({ control: "fit", step: result.step });
    setAnnounce(result.fits ? `Now fits on ${pageWord(result.pages)}.` : `Still ${pageWord(result.pages)} after the tightest spacing.`);
  };

  /* ── Print: mount the unclipped copy under <body>, mark the page, open the dialog ───────── */
  const [printing, setPrinting] = useState(false);
  const print = () => {
    flushSync(() => setPrinting(true));
    printResume(() => setPrinting(false));
  };

  const limitWord = NUMBER_WORDS[limit];

  return (
    <div data-print-layout data-pages={pages} className="flex min-h-full flex-col gap-3">
      <HiddenContentBar doc={doc} theme={theme} caps={caps} />

      {over && (
        <div
          role="status"
          data-print-banner={exhausted ? "still-over" : "over"}
          className="flex flex-col gap-2 rounded-2xl border border-v2-amber/40 bg-v2-amber-soft px-4 py-3 text-[13px] text-v2-amber-ink"
        >
          <p className="flex items-start gap-2 font-semibold">
            <AlertIcon className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
            {exhausted ? (
              <span>
                Still {pageWord(pages)} {"—"} hide a section or shorten bullets
              </span>
            ) : (
              <span>
                Over {pageWord(limit)} {"—"} Compact spacing or shorter bullets will fit it
              </span>
            )}
          </p>
          {exhausted ? (
            longest.length > 0 && (
              <div>
                <p className="text-[12.5px]">The longest items:</p>
                <ol className="mt-1 flex flex-col gap-1">
                  {longest.map((item) => (
                    <li key={item.itemId} data-longest-item={item.itemId} className="rounded-lg bg-paper/70 px-2.5 py-1.5 text-ink">
                      <span className="font-semibold">{item.label}</span>
                      <span className="text-ink-soft">
                        {" "}
                        {"·"} {item.section} {"·"} {item.chars} characters
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )
          ) : (
            <div>
              <Button variant="accent" size="sm" onClick={fit} disabled={disabled} className="min-h-11">
                Fit to {limitWord} {limit === 1 ? "page" : "pages"}
              </Button>
            </div>
          )}
        </div>
      )}

      {zoomable && (
        <div className="flex items-center justify-end gap-1" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink hover:bg-paper-2 disabled:opacity-40"
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-[12.5px] tabular-nums text-ink-soft" aria-live="polite">
            {/* config-literal-ok: fraction to percent unit conversion */}
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink hover:bg-paper-2 disabled:opacity-40"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        data-print-pages
        className={cn("min-h-0 flex-1 rounded-xl bg-paper-2 p-2", zoom > ZOOM_MIN ? "overflow-x-auto" : "overflow-x-hidden")}
        style={{ touchAction: zoomable ? "pan-x pan-y" : undefined }}
      >
        <ol className="mx-auto flex w-fit flex-col">
          {pagination.offsets.map((offset, i) => (
            <li key={i} className="flex flex-col">
              {i > 0 && (
                <div aria-hidden data-page-break className="my-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                  <span className="flex-1 border-t border-dashed border-ink-soft/50" />
                  Page break
                  <span className="flex-1 border-t border-dashed border-ink-soft/50" />
                </div>
              )}
              <p className="mb-1 text-[12px] font-semibold text-ink-soft">
                Page {i + 1} of {pages}
              </p>
              <div
                role="img"
                aria-label={`Page ${i + 1} of ${pages}`}
                data-page-box={i + 1}
                className="relative overflow-hidden bg-white shadow-[0_8px_24px_rgb(0_0_0/0.12)] ring-1 ring-black/5"
                style={{ width: pagination.pageWidthPx * scale, height: pagination.pageHeightPx * scale }}
              >
                {/* the drawn copy is a picture: its links must not take focus, and its text is not read page after page */}
                <div inert className="relative origin-top-left" style={{ width: pagination.pageWidthPx, height: pagination.pageHeightPx, transform: `scale(${scale})` }}>
                  <div className="absolute inset-x-0 overflow-hidden" style={{ top: pagination.marginPx, height: pagination.perPagePx }}>
                    <div ref={i === 0 ? measureRef : undefined} style={{ transform: `translateY(${-(pagination.marginPx + offset)}px)` }}>
                      <ResumePreview doc={deferredDoc} theme={theme} templateId={templateId} caps={caps} photoSrc={photoSrc} />
                    </div>
                  </div>
                  <div
                    aria-hidden
                    data-page-margin
                    className="pointer-events-none absolute border border-dashed border-ink-soft/25"
                    style={{ inset: pagination.marginPx }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-[12px] text-muted">For an exact file use Download PDF.</p>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <div ref={barRef} className="sticky bottom-0 -mx-5 mt-auto flex flex-wrap items-center gap-2 border-t border-line bg-paper px-5 py-3">
        <Button variant="accent" size="sm" onClick={onDownloadPdf} disabled={exporting || disabled} aria-busy={exporting} className="min-h-11 gap-2">
          {exporting ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
          {exporting ? "Preparing…" : "Download PDF"}
        </Button>
        <Button variant="ghost" size="sm" onClick={print} className="min-h-11 gap-2 bg-paper">
          <PrinterIcon className="h-4 w-4" />
          Print
        </Button>
        <p data-print-summary className="ml-auto text-[12.5px] text-ink-soft" aria-live="polite">
          <span className={cn("font-semibold", over ? "text-v2-amber-ink" : "text-ink")}>{pageWord(pages)}</span> {"·"} {templateName}
        </p>
      </div>

      {printing &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="rb-print-root">
            <ResumePreview doc={doc} theme={theme} templateId={templateId} caps={caps} photoSrc={photoSrc} />
          </div>,
          document.body,
        )}
    </div>
  );
}
