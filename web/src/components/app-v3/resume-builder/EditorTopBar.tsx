"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent, RefObject } from "react";
import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  Dialog,
  DownloadIcon,
  FileTextIcon,
  Input,
  Menu,
  Spinner,
  XIcon,
  buttonVariants,
  cn,
} from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import BrandLogo from "@/components/marketing/BrandLogo";
import { PANEL_META, PANEL_ORDER } from "./panels/panelMeta";
import type { PdfInfo } from "@/lib/resume-doc";
import PdfStatusSuffix from "./PdfStatusSuffix";
import type { LeftPanel, RightView } from "./state/ui";
import type { SaveStatus } from "./state/types";

/**
 * "Saved just now" (< 45 s), then whole minutes and hours (DESIGN 10.2). `null` = nothing has been
 * saved in this session and the server did not say when: the document is as loaded.
 */
export function savedAgo(savedAt: number | null, now: number): string {
  if (savedAt === null) return "All changes saved";
  // config-literal-ok: milliseconds -> seconds unit conversion, not a limit
  const s = Math.max(0, Math.round((now - savedAt) / 1000));
  if (s < 45) return "Saved just now";
  const m = Math.round(s / 60);
  if (m < 60) return `Saved ${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  return `Saved ${h} ${h === 1 ? "hour" : "hours"} ago`;
}

export function statusLabel(status: SaveStatus, savedAt: number | null, now: number, error: string | null): string {
  switch (status) {
    case "saved":
      return savedAgo(savedAt, now);
    case "saving":
      return "Saving…";
    case "retrying":
      return "Not saved — retrying";
    case "conflict":
      return "Not saved — edited elsewhere";
    case "error":
      return `Not saved — ${error ?? "something went wrong"}`;
  }
}

const SOON = <span className="ml-2 text-[11px] font-medium text-muted">Coming soon</span>;

/**
 * The editor's top bar, to the boards (DESIGN 10.2): kiwiply mark + wordmark, "Resume Builder", the
 * save status, the four panel toggles (the open one is highlighted green), Save, Download ▾ and ✕.
 * Panel buttons are toggles (`aria-pressed` / `aria-expanded` / `aria-controls="rb-left-sheet"`).
 * On a phone only ✕, the title, the status and the download menu remain (the panels live in the
 * bottom tab bar, DESIGN 10.9).
 */
export default function EditorTopBar({
  status,
  savedAt,
  now,
  error,
  leftPanel,
  onTogglePanel,
  panelRefs,
  showTailor = true,
  onDownloadPdf,
  onDownloadText,
  exporting = false,
  exportDisabled = false,
  downloadRef,
  rightView = null,
  onToggleView,
  printLayout = true,
  pdfView = true,
  onSave,
  onSaveAsVersion,
  canSave = false,
  saving = false,
  justSaved = false,
  onClose,
  pdf,
  onPdfRetry,
}: {
  status: SaveStatus;
  savedAt: number | null;
  now: number;
  error: string | null;
  leftPanel: LeftPanel | null;
  onTogglePanel: (panel: LeftPanel) => void;
  panelRefs: Record<LeftPanel, RefObject<HTMLButtonElement | null>>;
  /** `features.tailor` from the builder config. */
  showTailor?: boolean;
  /** Download ▾ → Save & Download PDF: saves a checkpoint, then downloads the stored PDF (R3.3). */
  onDownloadPdf: () => void;
  /** Download ▾ → Save & Download plain text (.txt). */
  onDownloadText: () => void;
  exporting?: boolean;
  exportDisabled?: boolean;
  /** Wraps the Download menu so `Alt+D` can open it. */
  downloadRef?: RefObject<HTMLSpanElement | null>;
  /** The open right-sheet view (Print layout / PDF view): the Download button shows it as pressed. */
  rightView?: RightView | null;
  /** Download ▾ → Print layout toggles the right sheet (DESIGN 10.8). */
  onToggleView?: (view: RightView) => void;
  /** `features.printLayout` from the builder config. */
  printLayout?: boolean;
  /** `features.pdfView` from the builder config. */
  pdfView?: boolean;
  /** Save (Ctrl/⌘+S): writes a checkpoint and queues the PDF (DESIGN 10.15). */
  onSave?: () => void;
  /** Save ▾ → Save as version…: a named checkpoint. */
  onSaveAsVersion?: (name: string) => void | Promise<void>;
  /** Something changed since the last checkpoint, or the PDF is stale / failed / missing. Otherwise Save reads "Saved" and is disabled. */
  canSave?: boolean;
  /** A checkpoint is being written. */
  saving?: boolean;
  /** The "Saved" confirmation (2 s after a Save). */
  justSaved?: boolean;
  onClose: () => void;
  /** The stored PDF's state (R3.7): shown as a muted suffix after the save status. */
  pdf?: PdfInfo | null;
  /** "Retry" in the failed-PDF suffix (asks for the PDF right now). */
  onPdfRetry?: () => void;
}) {
  const bad = status === "retrying" || status === "conflict" || status === "error";
  const busy = exporting || exportDisabled;
  const [naming, setNaming] = useState(false);
  const [versionName, setVersionName] = useState("");
  const submitName = (e: FormEvent) => {
    e.preventDefault();
    const name = versionName.trim();
    if (!name) return;
    setNaming(false);
    setVersionName("");
    void onSaveAsVersion?.(name);
  };
  const saveLabel = saving ? "Saving…" : justSaved || !canSave ? "Saved" : "Save";

  const viewItems: MenuEntry[] = [
    ...(printLayout
      ? [
          {
            label: <>Print layout{rightView === "print" && <span className="ml-2 text-[11px] font-medium text-muted">Open</span>}</>,
            icon: <FileTextIcon className="h-4 w-4" />,
            onSelect: () => onToggleView?.("print"),
          } satisfies MenuEntry,
        ]
      : []),
    ...(pdfView
      ? [
          {
            label: <>PDF view{rightView === "pdf" && <span className="ml-2 text-[11px] font-medium text-muted">Open</span>}</>,
            icon: <FileTextIcon className="h-4 w-4" />,
            onSelect: () => onToggleView?.("pdf"),
          } satisfies MenuEntry,
        ]
      : []),
  ];
  const downloadItems: MenuEntry[] = [
    ...viewItems,
    ...(viewItems.length > 0 ? [{ separator: true } satisfies MenuEntry] : []),
    { label: "Save & Download PDF", icon: <DownloadIcon className="h-4 w-4" />, onSelect: onDownloadPdf, disabled: busy },
    { label: "Save & Download plain text (.txt)", icon: <DownloadIcon className="h-4 w-4" />, onSelect: onDownloadText, disabled: busy },
    { label: <>Save &amp; Download DOCX{SOON}</>, icon: <DownloadIcon className="h-4 w-4" />, onSelect: () => {}, disabled: true },
  ];

  return (
    <header className="flex h-16 flex-none items-center gap-2 border-b border-line/60 bg-paper px-3 sm:gap-3 md:px-4">
      <Link href="/dashboard" aria-label="Kiwiply" className="hidden flex-none lg:block">
        <BrandLogo height={36} priority />
      </Link>
      <span aria-hidden className="hidden h-7 w-px flex-none bg-line lg:block" />
      <h1 className="order-1 flex-none font-display text-[15px] font-bold text-ink md:order-none md:text-[17px]">Resume Builder</h1>
      <span aria-hidden className="hidden h-7 w-px flex-none bg-line xl:block" />

      <p
        role="status"
        aria-live="polite"
        data-save-status={status}
        className={cn(
          "order-2 inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium md:order-none",
          bad ? "text-danger" : "text-muted",
        )}
      >
        {status === "saving" ? (
          <Spinner role="presentation" aria-hidden className="h-4 w-4 flex-none" />
        ) : status === "saved" ? (
          <CheckIcon className="h-4 w-4 flex-none rounded-full bg-ok p-0.5 text-white" strokeWidth={3} />
        ) : null}
        <span className="truncate" suppressHydrationWarning>
          {statusLabel(status, savedAt, now, error)}
        </span>
      </p>
      <PdfStatusSuffix pdf={pdf} onRetry={onPdfRetry} className="-ml-2" />

      <div className="ml-auto flex flex-none items-center gap-2 max-md:order-3">
        <div role="group" aria-label="Editor panels" className="hidden items-center gap-2 md:flex">
          {PANEL_ORDER.filter((p) => p !== "tailor" || showTailor).map((p) => {
            const meta = PANEL_META[p];
            const active = leftPanel === p;
            return (
              <button
                key={p}
                ref={panelRefs[p]}
                type="button"
                aria-pressed={active}
                aria-expanded={active}
                aria-controls="rb-left-sheet"
                aria-label={meta.title}
                title={`${meta.title} (Alt+${meta.shortcut})`}
                onClick={() => onTogglePanel(p)}
                className={buttonVariants(
                  active ? "accent" : "ghost",
                  "sm",
                  cn("min-h-11 gap-2 px-3 text-[14px]", active ? "border border-transparent" : "bg-paper"),
                )}
              >
                <span aria-hidden className="flex">
                  {meta.icon}
                </span>
                <span className="hidden min-[1420px]:inline">{meta.title}</span>
              </button>
            );
          })}
        </div>

        {/* Save (DESIGN 10.15): a checkpoint + the PDF now; "Saved" and disabled when nothing changed since the last one. */}
        <span className="hidden items-stretch lg:inline-flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={!onSave || saving || exportDisabled || (!canSave && !justSaved)}
            aria-busy={saving}
            title={canSave ? "Save (Ctrl+S)" : "Everything is saved"}
            data-save-button
            className="min-h-11 gap-2 rounded-r-none border-r-0 bg-paper px-3 text-[14px]"
          >
            {saving ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : saveLabel === "Saved" ? <CheckIcon className="h-4 w-4" /> : null}
            {saveLabel}
          </Button>
          <Menu
            align="end"
            disabled={saving || exportDisabled}
            items={[{ label: "Save as version…", icon: <FileTextIcon className="h-4 w-4" />, onSelect: () => setNaming(true) }]}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Save options"
                title="Save options"
                className="min-h-11 rounded-l-none bg-paper px-2"
              >
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            }
          />
        </span>

        <span ref={downloadRef} className="inline-flex">
          <Menu
            align="end"
            items={downloadItems}
            trigger={
              <Button
                variant="accent"
                size="sm"
                aria-label="Download"
                aria-busy={exporting}
                aria-pressed={rightView !== null}
                title="Download (Alt+D)"
                className={cn("min-h-11 gap-2 px-3 text-[14px]", rightView !== null && "ring-2 ring-accent-deep ring-offset-2 ring-offset-paper")}
              >
                {exporting ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : <DownloadIcon className="h-5 w-5" />}
                <span className="hidden lg:inline">{exporting ? "Preparing…" : "Download"}</span>
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            }
          />
        </span>

        <span aria-hidden className="hidden h-7 w-px flex-none bg-line md:block" />
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close editor"
        title="Close"
        className="order-first inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-line bg-paper text-ink transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:order-none"
      >
        <XIcon className="h-5 w-5" />
      </button>

      <Dialog
        open={naming}
        onClose={() => setNaming(false)}
        title="Save as version"
        description="Name this moment so you can find it later in the version history."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button variant="accent" type="submit" form="rb-version-form" disabled={!versionName.trim()}>
              Save version
            </Button>
          </>
        }
      >
        <form id="rb-version-form" onSubmit={submitName}>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            Version name
            <Input
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              // config-literal-ok: the version-name limit is a server rule (R3.9: at most 80 characters); the server refuses longer
              maxLength={80}
              placeholder="e.g. Before the Acme call"
              autoFocus
            />
          </label>
        </form>
      </Dialog>
    </header>
  );
}
