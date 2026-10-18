"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, Spinner, cn } from "@kiwiply/ui";
import type { OfflineReason, SyncStatus } from "@/lib/onboarding/useDraftSync";

/** DESIGN 5.14 / 7.2: "Saving…" only shows when a save takes longer than this (no flicker on a fast one). */
export const SAVING_DELAY_MS = 300;
/** DESIGN 14: the screen-reader announcement of "Saved" is throttled to once per this long. */
export const ANNOUNCE_EVERY_MS = 10_000; // config-literal-ok: a11y announcement throttle, DESIGN 14

export const SAVING_LABEL = "Saving…";
export const SAVED_LABEL = "Saved";
export const OFFLINE_LABEL = "Offline — saved on this device";
export const SERVER_LABEL = "Couldn't save — kept on this device";
export const DEMO_LABEL = "Demo accounts can't save — sign up to keep this.";
export const REFUSED_LABEL = "Not saved to your account — kept on this device";
export const CONFLICT_LABEL = "Not saved — updated on another device";

type Tone = "calm" | "warn" | "error";

/** The words and the tone for a sync state (null while nothing has been saved yet this visit). */
export function pillLabel(status: SyncStatus, reason: OfflineReason): { text: string; tone: Tone } | null {
  switch (status) {
    case "idle":
      return null;
    case "saving":
      return { text: SAVING_LABEL, tone: "calm" };
    case "saved":
      return { text: SAVED_LABEL, tone: "calm" };
    case "conflict":
      return { text: CONFLICT_LABEL, tone: "error" };
    case "offline":
      return { text: reason === "demo" ? DEMO_LABEL : reason === "refused" ? REFUSED_LABEL : reason === "server" ? SERVER_LABEL : OFFLINE_LABEL, tone: "warn" };
  }
}

/**
 * The quiet autosave status of the setup flow (Notion-style, DECISIONS #32; DESIGN 5.0 / 7.2): "Saving…" (only after
 * 300 ms in flight) -> "Saved ✓", or an amber "Offline — saved on this device" (the browser or the request is offline) or "Couldn't save — kept on this device" (the server answered with an error), each with Retry. There is no Save button anywhere.
 * The visible text is for the eyes; a separate polite live region carries what screen readers hear, throttled so "Saved"
 * is announced at most once per 10 s (never per keystroke) and a problem is announced the moment it starts.
 */
export default function SaveStatusPill({ status, reason, onRetry, className }: { status: SyncStatus; reason: OfflineReason; onRetry?: () => void; className?: string }) {
  const next = pillLabel(status, reason);
  const [saving, setSaving] = useState(false);
  // What was showing before a save began (a fast save never flickers in): adjusted during render, the endorsed pattern.
  const [stable, setStable] = useState(next);
  if (status !== "saving" && (stable?.text ?? null) !== (next?.text ?? null)) setStable(next);

  // "Saving…" waits 300 ms; until then the pill keeps whatever it showed before.
  useEffect(() => {
    if (status !== "saving") return;
    const t = setTimeout(() => setSaving(true), SAVING_DELAY_MS);
    return () => {
      clearTimeout(t);
      setSaving(false);
    };
  }, [status]);

  const visible = status === "saving" ? (saving ? next : stable) : next;

  // The announcement: a problem at once, "Saved" at most every 10 s (the latest wins when the wait ends).
  const [heard, setHeard] = useState("");
  const heardAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = next && status !== "saving" ? next : null;
  useEffect(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!say) return;
    const speak = () => {
      heardAt.current = Date.now();
      setHeard(say.text);
    };
    const wait = say.tone === "calm" ? heardAt.current + ANNOUNCE_EVERY_MS - Date.now() : 0;
    if (wait <= 0) speak();
    else timer.current = setTimeout(speak, wait);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [say?.text, say?.tone]); // eslint-disable-line react-hooks/exhaustive-deps -- `say` is derived from these two

  return (
    <div className={cn("flex flex-none items-center", className)} data-sync-status={status} data-testid="save-status">
      <span role="status" aria-live="polite" className="sr-only">
        {heard}
      </span>
      {visible && (
        <p
          aria-hidden
          data-save-tone={visible.tone}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium",
            visible.tone === "calm" && "text-v2-muted",
            visible.tone === "warn" && "rounded-full border border-v2-amber/60 bg-v2-amber-soft px-2.5 py-1 font-semibold text-v2-amber-ink",
            visible.tone === "error" && "rounded-full border border-danger/40 bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-2.5 py-1 font-semibold text-danger-text",
          )}
        >
          {visible.text === SAVING_LABEL ? (
            <Spinner role="presentation" aria-hidden className="h-4 w-4 flex-none" />
          ) : visible.text === SAVED_LABEL ? (
            <CheckIcon className="h-4 w-4 flex-none rounded-full bg-ok p-0.5 text-white" strokeWidth={3} />
          ) : null}
          <span className="leading-tight">{visible.text}</span>
        </p>
      )}
      {status === "offline" && (reason === "network" || reason === "server") && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1.5 flex-none whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12.5px] font-bold text-v2-amber-ink underline underline-offset-2 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11"
        >
          Retry
        </button>
      )}
    </div>
  );
}
