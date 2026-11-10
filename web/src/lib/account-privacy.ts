/**
 * Shapes and helpers for the personal account's privacy controls (sprint 2, B2): the scheduled account deletion with its undo
 * window, and the asynchronous data export. The API's words are kept as they are (`status`, `purgeAfter`, `downloadPath`).
 */

/** `NONE` (nothing pending), `PENDING` (inside the undo window), `RUNNING` (erasure has started: no undo), `DELETED` (a zero-hour window erased it at once). */
export type DeletionStatus = "NONE" | "PENDING" | "RUNNING" | "DELETED";

export interface DeletionView {
  status: DeletionStatus;
  requestedAt: string | null;
  purgeAfter: string | null;
  graceHours: number;
  canUndo: boolean;
}

export type ExportStatus = "QUEUED" | "RUNNING" | "READY" | "FAILED" | "EXPIRED";

export interface ExportJob {
  id: number;
  status: ExportStatus;
  requestedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  fileCount: number | null;
  skippedCount: number | null;
  error: string | null;
  /** Set only while the job is READY and not expired: a signed, expiring link that still needs the owner signed in. */
  downloadPath: string | null;
}

/** Jobs the page keeps asking about until they finish. */
export const ACTIVE_EXPORT: readonly ExportStatus[] = ["QUEUED", "RUNNING"];

/** A download link is only ever followed when it points at our own export route (never an absolute URL from a response body). */
export function safeDownloadPath(path: string | null | undefined): string | null {
  return typeof path === "string" && /^\/api\/account\/exports\/\d+\/file(\?[A-Za-z0-9_=&-]*)?$/.test(path) ? path : null;
}

/** "23 h 41 min", "41 min", "Less than a minute": how long is left in the undo window. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Any moment now";
  const minutes = Math.ceil(ms / 60_000);
  if (ms < 60_000) return "Less than a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "184 KB", "12.4 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
