"use client";

import Link from "next/link";
import { ArrowLeftIcon, Button, CheckIcon, DownloadIcon, IconButton, Spinner, RedoIcon, UndoIcon, cn } from "@kiwiply/ui";
import type { SaveStatus } from "./state/types";

/** "just now" for the first minute, then whole minutes / hours. Pure, so it is testable. */
export function savedAgo(savedAt: number | null, now: number): string {
  if (savedAt === null) return "All changes saved";
  const s = Math.max(0, Math.round((now - savedAt) / 1000));
  if (s < 45) return "Saved · just now";
  const m = Math.round(s / 60);
  if (m < 60) return `Saved · ${m} min ago`;
  return `Saved · ${Math.round(m / 60)} h ago`;
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

/**
 * The editor's top bar: back to the list, the resume's name (it is the label shown everywhere),
 * the autosave status, undo / redo, and Export PDF.
 */
export default function EditorTopBar({
  title,
  onTitleChange,
  onTitleBlur,
  status,
  savedAt,
  now,
  error,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
  exporting = false,
  exportDisabled = false,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  onTitleBlur: () => void;
  status: SaveStatus;
  savedAt: number | null;
  now: number;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport?: () => void;
  exporting?: boolean;
  exportDisabled?: boolean;
}) {
  const bad = status === "retrying" || status === "conflict" || status === "error";
  return (
    <div className="sticky top-16 z-20 -mx-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 bg-paper/95 px-3.5 py-2 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
      <Link
        href="/resume-builder"
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink sm:min-h-9"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">My resumes</span>
        <span className="sm:hidden">Back</span>
      </Link>

      <label className="min-w-0 flex-1 basis-40">
        <span className="sr-only">Resume name</span>
        <input
          value={title}
          maxLength={200}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={onTitleBlur}
          placeholder="Untitled resume"
          className="min-h-11 w-full min-w-0 truncate rounded-lg border border-transparent bg-transparent px-2 font-display text-[16px] font-bold text-ink outline-none hover:border-line focus:border-accent focus:bg-paper sm:min-h-9"
        />
      </label>

      <p
        role="status"
        aria-live="polite"
        data-save-status={status}
        className={cn("inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium", bad ? "text-danger" : "text-ink-soft")}
      >
        {status === "saving" ? <Spinner role="presentation" aria-hidden className="h-3.5 w-3.5" /> : status === "saved" ? <CheckIcon className="h-3.5 w-3.5 text-ok" /> : null}
        <span className="truncate">{statusLabel(status, savedAt, now, error)}</span>
      </p>

      <div className="flex items-center gap-0.5">
        <IconButton aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled={!canUndo} onClick={onUndo} className="h-11 w-11 sm:h-8 sm:w-8">
          <UndoIcon className="h-4 w-4" />
        </IconButton>
        <IconButton aria-label="Redo" title="Redo (Shift Ctrl/⌘ Z)" disabled={!canRedo} onClick={onRedo} className="h-11 w-11 sm:h-8 sm:w-8">
          <RedoIcon className="h-4 w-4" />
        </IconButton>
      </div>

      {onExport && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          disabled={exporting || exportDisabled}
          aria-busy={exporting}
          className="min-h-11 sm:min-h-9"
        >
          {exporting ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : <DownloadIcon className="h-4 w-4" />}
          <span>{exporting ? "Making PDF…" : "Export PDF"}</span>
        </Button>
      )}
    </div>
  );
}
