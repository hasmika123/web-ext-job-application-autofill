"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertIcon, Button, DownloadIcon, FileTextIcon, SIDE_SHEET_MS, Spinner, cn, getTemplate, useBottomBar } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { exportPdf, saveBlob, type PdfInfo } from "@/lib/resume-doc";
import HiddenContentBar from "../HiddenContentBar";

/** The idle time before "auto refresh" (`resume.pdf.viewAutoRefresh`) re-makes a stale PDF: a pause in typing, not a limit. */
// config-literal-ok: debounce between the last edit and an automatic re-render (the autosave settles inside it); the on/off switch is the setting
const AUTO_REFRESH_IDLE_MS = 3000;
/** How often the "generated 2 minutes ago" label repaints. */
// config-literal-ok: repaint tick for a relative-time label (display only), not a builder timing
const LABEL_TICK_MS = 30_000;

/** What the shown PDF was made from: the view is stale as soon as any of these is no longer the editor's. */
interface Snapshot {
  doc: ResumeDocument;
  theme: Partial<ResumeTheme> | null;
  templateId: string;
}

type View =
  | { status: "loading" }
  | { status: "generating" }
  | { status: "ready"; url: string; blob: Blob; fileName: string; pages: number; cached: boolean; generatedAt: number | null; snap: Snapshot }
  | { status: "error"; busy: boolean; message: string };

/** "just now" · "3 minutes ago" · "2 hours ago" · "4 days ago". */
export function relativeTime(then: number, now: number): string {
  // config-literal-ok: milliseconds -> seconds unit conversion, not a limit
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

export interface PdfViewProps {
  resumeId: number;
  doc: ResumeDocument;
  /** The STORED theme and template: what the server prints. */
  theme: Partial<ResumeTheme> | null;
  templateId: string;
  caps: TemplateCapabilities;
  /** Flush pending edits so the PDF is made from the saved document. `false` = they could not be saved. */
  prepare: () => Promise<boolean>;
  /** The stored PDF's state (R3.7): decides between "Loading" and "Making your PDF". */
  pdfInfo?: PdfInfo | null;
  /** `resume.pdf.viewAutoRefresh`: re-make a stale PDF by itself once typing pauses. */
  autoRefresh?: boolean;
  /** A save conflict is open: the view does not render. */
  disabled?: boolean;
  /** A render stored a new PDF on the resume: look at its status once. */
  onStored?: () => void;
}

/**
 * PDF view (DESIGN 10.8): the real server PDF in the browser's own viewer. On open it flushes the autosave and asks
 * `GET /export?format=pdf&cached=1`, which streams the stored file when it is current (no Chromium call) and
 * renders + stores it otherwise. The result is shown in an `<iframe title="PDF preview">` from a Blob URL. When the
 * document, template or theme moves on, the header says so ("Refresh"); nothing re-renders by itself unless the
 * setting asks for it, because Chromium is shared. Download saves the shown blob (no second render). Browsers with
 * no inline viewer (`navigator.pdfViewerEnabled === false`) get "Open PDF" / "Download" instead.
 */
export default function PdfView({
  resumeId,
  doc,
  theme,
  templateId,
  caps,
  prepare,
  pdfInfo = null,
  autoRefresh = false,
  disabled = false,
  onStored,
}: PdfViewProps) {
  const [view, setView] = useState<View>(() => ({ status: pdfInfo?.status === "READY" ? "loading" : "generating" }));
  const [tab, setTab] = useState<"pdf" | "ats">("pdf");
  const [noViewer, setNoViewer] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // The browser's PDF viewer paints black when its frame is inserted while the sheet is still sliding in (a transformed
  // ancestor), so the frame is mounted once the slide has finished. The fetch usually takes longer than that anyway.
  const [slid, setSlid] = useState(false);

  // The sticky Download bar tells the floating bug-report button / toasts to stay above it (phones).
  const barRef = useRef<HTMLDivElement>(null);
  useBottomBar(barRef);
  const seq = useRef(0);
  const urlRef = useRef<string | null>(null);
  const latest = useRef<Snapshot>({ doc, theme, templateId });
  const hooks = useRef({ prepare, pdfInfo, onStored });
  useEffect(() => {
    latest.current = { doc, theme, templateId };
    hooks.current = { prepare, pdfInfo, onStored };
  });

  const run = useCallback(async () => {
    const token = ++seq.current;
    const ok = await hooks.current.prepare();
    if (token !== seq.current) return;
    if (!ok) {
      setView({ status: "error", busy: false, message: "Your latest changes aren't saved yet. Fix the save problem shown above, then try again." });
      return;
    }
    // Whatever the editor holds now is what this PDF is made from; typing during the render makes it stale on arrival.
    const snap = latest.current;
    const res = await exportPdf(resumeId);
    if (token !== seq.current) return;
    if (res.kind === "error") {
      const busy = res.code === "PDF_BUSY"; // the render service refused for load (503)
      setView({ status: "error", busy, message: busy ? "The PDF service is busy — try again in a moment." : res.message });
      return;
    }
    const url = URL.createObjectURL(res.blob);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    const stamp = hooks.current.pdfInfo?.generatedAt ? Date.parse(hooks.current.pdfInfo.generatedAt) : Number.NaN;
    setView({
      status: "ready",
      url,
      blob: res.blob,
      fileName: res.fileName,
      pages: res.pages,
      cached: res.cached,
      // a stored copy whose time the server did not hand us is shown as "your saved copy", never as "just now"
      generatedAt: res.cached ? (Number.isFinite(stamp) ? stamp : null) : Date.now(),
      snap,
    });
    if (!res.cached && res.stored) hooks.current.onStored?.();
  }, [resumeId]);

  /** Refresh / Retry: show the spinner again, then fetch. */
  const refresh = useCallback(() => {
    setView({ status: "generating" });
    void run();
  }, [run]);

  useEffect(() => {
    track("resume_pdf_view_opened", { status: hooks.current.pdfInfo?.status ?? "NONE" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the view starts the fetch; the state it sets arrives after awaits
    void run();
    return () => {
      seq.current += 1; // an answer that arrives after this is dropped
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [run]);

  useEffect(() => {
    // After mount, so server and client markup agree; iOS Safari and many Android browsers have no inline PDF viewer.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator only exists on the client
    setNoViewer(typeof navigator !== "undefined" && navigator.pdfViewerEnabled === false);
    const t = setInterval(() => setNow(Date.now()), LABEL_TICK_MS);
    const slide = setTimeout(() => setSlid(true), SIDE_SHEET_MS + 50);
    return () => {
      clearInterval(t);
      clearTimeout(slide);
    };
  }, []);

  const stale =
    view.status === "ready" && (view.snap.doc !== doc || view.snap.theme !== theme || view.snap.templateId !== templateId);

  useEffect(() => {
    if (!autoRefresh || !stale) return;
    const t = setTimeout(refresh, AUTO_REFRESH_IDLE_MS);
    return () => clearTimeout(t);
  }, [autoRefresh, stale, doc, theme, templateId, refresh]);

  const download = () => {
    if (view.status !== "ready") return;
    saveBlob(view.blob, view.fileName);
    track("resume_download", { format: "pdf", cached: view.cached });
  };
  const openInTab = () => {
    if (view.status === "ready") window.open(view.url, "_blank", "noopener");
  };

  const templateName = getTemplate(templateId).meta.name;
  const ready = view.status === "ready" ? view : null;

  return (
    <div data-pdf-view data-pdf-state={stale ? "stale" : view.status} className="flex min-h-full flex-col gap-3">
      <HiddenContentBar doc={doc} theme={theme} caps={caps} />

      <div role="tablist" aria-label="PDF view" className="flex gap-1 border-b border-line">
        {(
          [
            ["pdf", "PDF"],
            ["ats", "How an ATS sees it"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`rb-pdf-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`rb-pdf-panel-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px min-h-11 border-b-2 px-3 text-[13px] font-semibold transition-colors",
              tab === value ? "border-accent-deep text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ats" ? (
        <div
          role="tabpanel"
          id="rb-pdf-panel-ats"
          aria-labelledby="rb-pdf-tab-ats"
          data-ats-placeholder
          className="rounded-xl border border-dashed border-line bg-paper-2/60 p-4 text-[13.5px] leading-relaxed text-ink-soft"
        >
          <p className="font-semibold text-ink">Coming soon</p>
          <p className="mt-1">See what an applicant tracking system reads from this PDF, field by field, and which details it would miss.</p>
        </div>
      ) : (
        <div role="tabpanel" id="rb-pdf-panel-pdf" aria-labelledby="rb-pdf-tab-pdf" className="flex min-h-0 flex-1 flex-col gap-3">
          {ready && !stale && (
            <p data-pdf-header className="text-[12.5px] text-ink-soft" suppressHydrationWarning>
              PDF {"·"} {ready.generatedAt === null ? "your saved copy" : `generated ${relativeTime(ready.generatedAt, now)}`}
            </p>
          )}
          {stale && ready && (
            <div
              role="status"
              data-pdf-banner="stale"
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-v2-amber/40 bg-v2-amber-soft px-4 py-2.5 text-[13px] font-semibold text-v2-amber-ink"
            >
              <AlertIcon className="h-4 w-4 flex-none" aria-hidden />
              <span>Document changed since this PDF</span>
              <span aria-hidden>{"·"}</span>
              <button
                type="button"
                onClick={refresh}
                disabled={disabled}
                className="min-h-11 cursor-pointer rounded px-1 underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0"
              >
                Refresh
              </button>
            </div>
          )}

          {(view.status === "loading" || view.status === "generating") && (
            <div
              role="status"
              aria-live="polite"
              data-pdf-spinner={view.status}
              className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-paper-2 p-6 text-center text-[13.5px] text-ink-soft"
            >
              <Spinner role="presentation" aria-hidden className="h-6 w-6" />
              <p>{view.status === "loading" ? "Loading your PDF…" : "Making your PDF…"}</p>
            </div>
          )}

          {view.status === "error" && (
            <div
              role="alert"
              data-pdf-error={view.busy ? "busy" : "failed"}
              className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-danger/30 bg-paper-2 p-6 text-center text-[13.5px] text-ink"
            >
              <AlertIcon className="h-6 w-6 text-danger" aria-hidden />
              <p className="max-w-[28ch] font-semibold">{view.busy ? "The PDF service is busy — try again in a moment." : "Couldn't make the PDF"}</p>
              {!view.busy && <p className="max-w-[34ch] text-ink-soft">{view.message}</p>}
              <Button variant="accent" size="sm" onClick={refresh} disabled={disabled} className="min-h-11">
                Retry
              </Button>
            </div>
          )}

          {ready && noViewer && (
            <div
              data-pdf-fallback
              className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-paper-2 p-6 text-center text-[13.5px] text-ink-soft"
            >
              <FileTextIcon className="h-8 w-8 text-ink-soft" aria-hidden />
              <p className="max-w-[30ch]">
                Your browser can&apos;t show a PDF here. Open it in a new tab or download it.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="accent" size="sm" onClick={openInTab} className="min-h-11">
                  Open PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={download} className="min-h-11 gap-2 bg-paper">
                  <DownloadIcon className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          )}

          {ready && !noViewer && slid && (
            <iframe
              title="PDF preview"
              src={`${ready.url}#toolbar=0&view=FitH`}
              className={cn("min-h-[60vh] w-full flex-1 rounded-xl border border-line bg-white", stale && "opacity-70")}
            />
          )}
        </div>
      )}

      <div ref={barRef} className="sticky bottom-0 -mx-5 mt-auto flex flex-wrap items-center gap-2 border-t border-line bg-paper px-5 py-3">
        <Button variant="accent" size="sm" onClick={download} disabled={!ready || disabled} className="min-h-11 gap-2">
          <DownloadIcon className="h-4 w-4" />
          Download PDF
        </Button>
        <p data-pdf-summary className="ml-auto text-[12.5px] text-ink-soft" aria-live="polite">
          {ready && (
            <>
              <span className="font-semibold text-ink">
                {ready.pages} {ready.pages === 1 ? "page" : "pages"}
              </span>{" "}
              {"·"}{" "}
            </>
          )}
          {templateName}
        </p>
      </div>
    </div>
  );
}
