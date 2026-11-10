/**
 * "Prepare selected openings" (X12.9) — the drawer's side of the batch. Thin by design: the service
 * worker owns the batch (JAF.prepareBatch, persisted per account); the drawer only asks for a summary,
 * repaints when the stored state changes, and sends three commands. Nothing here opens a tab, fills,
 * clicks or submits — "Open next" and "Stop batch" are requests to the worker, which does the opening.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type BatchJob = {
  matchId: number | string;
  title: string;
  company: string;
  state: "QUEUED" | "OPENED" | "PREFILLED" | "NEEDS_INPUT" | "SUBMIT_DETECTED" | "CLOSED" | "FAILED";
  reason: string;
  /** What the consultant should do about `reason` (empty when there is nothing to do). */
  help: string;
  tabOpen: boolean;
};

export type BatchStatus = {
  sessionId: string;
  orgId: number;
  stopped: boolean;
  done: boolean;
  jobs: BatchJob[];
  counts: {
    total: number;
    waiting: number;
    filled: number;
    needsInput: number;
    submitted: number;
    closed: number;
    failed: number;
    queued: number;
    active: number;
  };
};

function ask(type: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type }, (resp) => {
        void chrome.runtime.lastError;
        resolve(resp ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** The batch of the connected account, or null when there is none. */
export async function readBatch(): Promise<BatchStatus | null> {
  const r = await ask("JAF_BATCH_STATUS");
  return r && Array.isArray(r.jobs) ? (r as BatchStatus) : null;
}

/** Repaint callback whenever the persisted batch changes. Returns the unsubscribe. */
export function watchBatch(onChange: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === "local" && Object.keys(changes).some((k) => /^ws:\d+:prepareBatch$/.test(k))) onChange();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export const openNext = (): Promise<{ ok: boolean; reason?: string } | null> => ask("JAF_BATCH_OPEN_NEXT");
export const stopBatch = (): Promise<{ ok: boolean } | null> => ask("JAF_BATCH_STOP");
export const dismissBatch = (): Promise<{ ok: boolean } | null> => ask("JAF_BATCH_DISMISS");
