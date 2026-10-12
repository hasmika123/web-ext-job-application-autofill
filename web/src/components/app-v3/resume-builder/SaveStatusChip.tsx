"use client";

import { CheckIcon, Spinner, cn } from "@kiwiply/ui";
import type { SaveStatus } from "./state/types";

/**
 * "Saved" for the first 45 s (the green check says the rest), then whole minutes and hours (DESIGN 10.2 / 10.15).
 * `null` = nothing has been saved in this session and the server did not say when: the document is as loaded.
 */
export function savedAgo(savedAt: number | null, now: number): string {
  if (savedAt === null) return "All changes saved";
  // config-literal-ok: milliseconds -> seconds unit conversion, not a limit
  const s = Math.max(0, Math.round((now - savedAt) / 1000));
  if (s < 45) return "Saved";
  const m = Math.round(s / 60);
  if (m < 60) return `Saved ${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  return `Saved ${h} ${h === 1 ? "hour" : "hours"} ago`;
}

export const OFFLINE_LABEL = "Offline — changes will save when you're back";

export function statusLabel(status: SaveStatus, savedAt: number | null, now: number, error: string | null, online = true): string {
  if (!online) return OFFLINE_LABEL;
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

/** The chip's tone: calm while things are fine, loud amber while a save is failing or the browser is offline, red for a refusal. */
export type ChipTone = "calm" | "warn" | "error";

export function chipTone(status: SaveStatus, online: boolean): ChipTone {
  if (!online || status === "retrying") return "warn";
  if (status === "error" || status === "conflict") return "error";
  return "calm";
}

/**
 * The one save indicator (Notion-style autosave, DECISIONS #32), next to "Resume Builder" in the top bar at every width:
 *   Saving…  ->  Saved ✓  ->  Saved 2 min ago        (subtle)
 *   Not saved — retrying · Offline — changes will save when you're back   (loud amber, with Retry)
 * Nothing else in the editor says "save": there is no Save button.
 */
export default function SaveStatusChip({
  status,
  savedAt,
  now,
  error,
  online = true,
  onRetry,
  className,
}: {
  status: SaveStatus;
  savedAt: number | null;
  now: number;
  error: string | null;
  online?: boolean;
  /** "Retry" in a failing state: try the save right now. */
  onRetry?: () => void;
  className?: string;
}) {
  const tone = chipTone(status, online);
  const label = statusLabel(status, savedAt, now, error, online);
  const failing = tone !== "calm";
  const showRetry = !!onRetry && status !== "conflict" && failing;
  return (
    <p
      role="status"
      aria-live="polite"
      data-save-status={online ? status : "offline"}
      data-save-tone={tone}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium",
        tone === "calm" && "text-muted",
        // a loud message gets a row of its own on a phone, so it is read in full instead of squeezed beside the title
        failing && "max-sm:order-last max-sm:basis-full max-sm:justify-center",
        tone === "warn" && "rounded-full border border-v2-amber/60 bg-v2-amber-soft px-2.5 py-1 font-semibold text-v2-amber-ink",
        tone === "error" && "rounded-full border border-danger/40 bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-2.5 py-1 font-semibold text-danger",
        className,
      )}
    >
      {online && status === "saving" ? (
        <Spinner role="presentation" aria-hidden className="h-4 w-4 flex-none" />
      ) : online && status === "saved" ? (
        <CheckIcon className="h-4 w-4 flex-none rounded-full bg-ok p-0.5 text-white" strokeWidth={3} />
      ) : null}
      <span className="min-w-0 leading-tight max-md:line-clamp-2 md:truncate" suppressHydrationWarning>
        {label}
      </span>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex-none rounded-md px-1.5 py-0.5 text-[12.5px] font-bold underline underline-offset-2 hover:bg-paper/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11"
        >
          Retry
        </button>
      )}
    </p>
  );
}
