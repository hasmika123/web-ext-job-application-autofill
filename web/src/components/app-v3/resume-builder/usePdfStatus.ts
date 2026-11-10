"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPdfStatus, pdfIsUpdating, requestPdfNow, type PdfInfo } from "@/lib/resume-doc";

/**
 * The editor's view of the stored PDF (Resume Builder R3.7, DESIGN 8.5). Starts from the status the document
 * came with; every successful save makes it PENDING (the server re-queues the PDF whenever the render
 * changed) and, while it is not READY, asks `GET .../doc/pdf-status` on the cadence the server hands down
 * (`pollMs`, a setting) for at most `pollWindowMs` after the last save (also a setting). Then it stops; the next
 * save (or Retry) starts it again. Nothing here knows an interval: with no hint from the server there is no polling.
 *
 *   savedAt  changes on every successful save (the editor's `state.savedAt`)
 *   retry()  FAILED -> "Retry": asks the server to make the PDF now, then polls like after a save
 *   refresh() looks once (after a synchronous export stored the current PDF)
 */
export function usePdfStatus(resumeId: number, initial: PdfInfo | null | undefined, savedAt: number | null) {
  // The last thing the server told us, and when. A save newer than that answer makes the PDF PENDING again.
  const [server, setServer] = useState<{ info: PdfInfo | null; at: number }>({ info: initial ?? null, at: 0 });
  // Retry / queue-on-open start a polling window just like a save does.
  const [nudgedAt, setNudgedAt] = useState(0);
  const hints = useRef<{ pollMs?: number; windowMs?: number }>({ pollMs: initial?.pollMs ?? undefined, windowMs: initial?.pollWindowMs ?? undefined });

  const adopt = useCallback((next: PdfInfo) => {
    hints.current = { pollMs: next.pollMs ?? hints.current.pollMs, windowMs: next.pollWindowMs ?? hints.current.windowMs };
    setServer({ info: next, at: Date.now() });
  }, []);

  const pdf: PdfInfo | null = useMemo(() => {
    const newerSave = savedAt !== null && savedAt > server.at;
    return newerSave ? { ...(server.info ?? { status: "NONE" }), status: "PENDING", error: null } : server.info;
  }, [server, savedAt]);
  const since = Math.max(savedAt ?? 0, nudgedAt);

  // A document that opens with a PDF behind it (STALE) is queued once; the poll then follows it.
  const staleOnOpen = useRef(initial?.status === "STALE");
  useEffect(() => {
    if (!staleOnOpen.current) return;
    staleOnOpen.current = false;
    void requestPdfNow(resumeId).then(() => setNudgedAt(Date.now()));
  }, [resumeId]);

  const updating = pdfIsUpdating(pdf?.status);
  useEffect(() => {
    if (!updating || since === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();

    const tick = async () => {
      if (cancelled) return;
      const next = await getPdfStatus(resumeId, ctrl.signal);
      if (cancelled) return;
      if (next) adopt(next);
      const { pollMs, windowMs } = hints.current;
      // No interval from the server (an older API, or a failed first call): never guess one.
      if (!pollMs || !windowMs) return;
      if (next && !pdfIsUpdating(next.status)) return;
      if (Date.now() - since + pollMs > windowMs) return; // the window is over: reopening resumes
      timer = setTimeout(() => void tick(), pollMs);
    };

    // The first look waits one interval when it is known (the save just happened), otherwise it asks now to learn it.
    timer = setTimeout(() => void tick(), hints.current.pollMs ?? 0);
    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [updating, since, resumeId, adopt]);

  const retry = useCallback(() => {
    setServer((s) => ({ info: { ...(s.info ?? { status: "NONE" }), status: "PENDING", error: null }, at: Date.now() }));
    void requestPdfNow(resumeId).then(() => setNudgedAt(Date.now()));
  }, [resumeId]);

  // After a synchronous export stored the current PDF the row is already READY: look once instead of waiting for a poll.
  const refresh = useCallback(async () => {
    const next = await getPdfStatus(resumeId);
    if (next) adopt(next);
  }, [resumeId, adopt]);

  // Save (R3.3): the checkpoint queued the PDF at once and answered with its state; follow it like after a save.
  const follow = useCallback(
    (next: PdfInfo | null) => {
      if (next) adopt(next);
      setNudgedAt(Date.now());
    },
    [adopt],
  );

  return { pdf, retry, refresh, follow };
}
