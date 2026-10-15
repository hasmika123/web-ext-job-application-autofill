"use client";

import Link from "next/link";
import type { RefObject } from "react";
import {
  Button,
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  GearIcon,
  Menu,
  SavedTick,
  Spinner,
  Tooltip,
  XIcon,
  buttonVariants,
  cn,
} from "@kiwiply/ui";
import type { MenuEntry, SavedFlash } from "@kiwiply/ui";
import BrandLogo from "@/components/marketing/BrandLogo";
import { useBuilderEnv } from "./builderEnv";
import { PANEL_META, PANEL_ORDER } from "./panels/panelMeta";
import type { PdfInfo } from "@/lib/resume-doc";
import PdfStatusSuffix from "./PdfStatusSuffix";
import SaveStatusChip from "./SaveStatusChip";
import type { LeftPanel, RightView } from "./state/ui";
import type { SaveStatus } from "./state/types";

// The status words moved to SaveStatusChip; re-exported so existing imports keep working.
export { savedAgo, statusLabel } from "./SaveStatusChip";

const SOON = <span className="ml-2 text-[11px] font-medium text-muted">Coming soon</span>;

/**
 * The editor's top bar, to the boards (DESIGN 10.2): kiwiply mark + wordmark, "Resume Builder", the
 * save status chip (the only save UI: no Save button, DECISIONS #32), the four panel toggles (the open one is
 * highlighted green), Download ▾ and ✕. Every icon-only control carries a tooltip with the same words as its
 * `aria-label` (+ the shortcut).
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
  approvalNotice = null,
  allowDownload = true,
  onDownloadPdf,
  onDownloadText,
  exporting = false,
  exportDisabled = false,
  downloadRef,
  rightView = null,
  onToggleView,
  onOpenSettings,
  settingsInMenu = false,
  printLayout = true,
  pdfView = true,
  online = true,
  onRetrySave,
  savedFlash,
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
  /** Next to the save state when the session is acting for someone ("Pending consultant approval"), or null. */
  approvalNotice?: string | null;
  /** False while acting for someone: the Download menu (saves a version, stores a PDF) is not drawn. */
  allowDownload?: boolean;
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
  onToggleView?: (view: Exclude<RightView, "settings">) => void;
  /** Opens Resume settings; offered in the Download menu when `settingsInMenu` (phone). */
  onOpenSettings?: () => void;
  settingsInMenu?: boolean;
  /** `features.printLayout` from the builder config. */
  printLayout?: boolean;
  /** `features.pdfView` from the builder config. */
  pdfView?: boolean;
  /** `navigator.onLine`: false turns the status chip into the loud "Offline" one. */
  online?: boolean;
  /** "Retry" in the failing states of the status chip: try the autosave right now. */
  onRetrySave?: () => void;
  /** The inline "saved" ticks (Add Section / Pick Template buttons show one when their change persisted). */
  savedFlash?: SavedFlash<"section" | "template">;
  onClose: () => void;
  /** The stored PDF's state (R3.7): shown as a muted suffix after the save status. */
  pdf?: PdfInfo | null;
  /** "Retry" in the failed-PDF suffix (asks for the PDF right now). */
  onPdfRetry?: () => void;
}) {
  const busy = exporting || exportDisabled;
  const env = useBuilderEnv();

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
    // On a phone the header's ⋮ is far up the page: Resume settings is also one tap from here (DESIGN 10.12).
    ...(settingsInMenu && onOpenSettings
      ? [{ separator: true } satisfies MenuEntry, { label: "Resume settings", icon: <GearIcon className="h-4 w-4" />, onSelect: onOpenSettings } satisfies MenuEntry]
      : []),
  ];
  /** Print layout / PDF view is open (Resume settings, the third right view, is not a Download view). */
  const viewOpen = rightView === "print" || rightView === "pdf";

  return (
    <header className="flex min-h-16 flex-none items-center gap-2 border-b max-sm:flex-wrap max-sm:gap-y-1 border-line/60 bg-paper px-3 max-sm:py-1 sm:gap-3 md:px-4">
      {env.brandHref && (
        <>
          <Link href={env.brandHref} aria-label="Kiwiply" className="hidden flex-none lg:block">
            <BrandLogo height={36} priority />
          </Link>
          <span aria-hidden className="hidden h-7 w-px flex-none bg-line lg:block" />
        </>
      )}
      <h1 className="order-1 flex-none font-display text-[15px] font-bold text-ink md:order-none md:text-[17px]">Resume Builder</h1>
      <span aria-hidden className="hidden h-7 w-px flex-none bg-line xl:block" />

      <SaveStatusChip
        status={status}
        savedAt={savedAt}
        now={now}
        error={error}
        online={online}
        onRetry={onRetrySave}
        className="order-2 md:order-none"
      />
      <PdfStatusSuffix pdf={pdf} onRetry={onPdfRetry} className="-ml-2" />
      {approvalNotice && (
        <span data-approval-notice className="order-2 inline-flex min-h-8 items-center rounded-full border border-v2-amber/40 bg-v2-amber-soft px-3 text-[12.5px] font-semibold text-ink md:order-none">
          {approvalNotice}
        </span>
      )}

      <div className="ml-auto flex flex-none items-center gap-2 max-md:order-3">
        <div role="group" aria-label="Editor panels" className="hidden items-center gap-2 md:flex">
          {PANEL_ORDER.filter((p) => p !== "tailor" || showTailor).map((p) => {
            const meta = PANEL_META[p];
            const active = leftPanel === p;
            const tick = p === "add" ? ("section" as const) : p === "template" ? ("template" as const) : null;
            return (
              <span key={p} className="relative inline-flex">
                <Tooltip content={`${meta.title} (Alt+${meta.shortcut})`} side="bottom">
                  <button
                    ref={panelRefs[p]}
                    type="button"
                    aria-pressed={active}
                    aria-expanded={active}
                    aria-controls="rb-left-sheet"
                    aria-label={meta.title}
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
                </Tooltip>
                {savedFlash && tick && <SavedTick flash={savedFlash} id={tick} className="absolute -right-1 -top-1 z-10" />}
              </span>
            );
          })}
        </div>

        {allowDownload && (
        <span ref={downloadRef} className="inline-flex">
          <Tooltip content="Download (Alt+D)" side="bottom">
            <Menu
              align="end"
              items={downloadItems}
              trigger={
                <Button
                  variant="accent"
                  size="sm"
                  aria-label="Download"
                  aria-busy={exporting}
                  aria-pressed={viewOpen}
                  className={cn("min-h-11 gap-2 px-3 text-[14px]", viewOpen && "ring-2 ring-accent-deep ring-offset-2 ring-offset-paper")}
                >
                  {exporting ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : <DownloadIcon className="h-5 w-5" />}
                  <span className="hidden lg:inline">{exporting ? "Preparing…" : "Download"}</span>
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              }
            />
          </Tooltip>
        </span>
        )}

        <span aria-hidden className="hidden h-7 w-px flex-none bg-line md:block" />
      </div>

      <Tooltip content="Close editor" side="bottom">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close editor"
          className="order-first inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-line bg-paper text-ink transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:order-none"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </Tooltip>
    </header>
  );
}
