"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { EmptyState, ErrorState, SideSheet, Spinner } from "@kiwiply/ui";
import type { AdminHistoryRow, AdminResult } from "@/lib/admin-client";
import { useNarrow } from "./useNarrow";

const LIMIT = 50; // config-literal-ok: the API's default history page (it clamps 1..200)
const WIDTH = 520; // config-literal-ok: drawer width in px (the SideSheet default for a right drawer)
const CUT = 80; // config-literal-ok: characters of a value shown before it is cut
const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false };

/** "ai.route.parse.model" reads better as "route · parse · model". Pages pass their own `formatKey` to drop a prefix. */
export function dottedKey(key: string): string {
  return key.split(".").join(" · ");
}

/** Values are short settings (a model id, true / false, a JSON list); long ones are cut so a row stays a row. */
export function shortValue(v: string | null): string {
  if (v === null || v === "") return "none";
  return v.length > CUT ? `${v.slice(0, CUT - 3)}…` : v;
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; rows: AdminHistoryRow[] };

export interface HistoryLoader {
  /** Reads the newest `limit` changes. */
  (limit: number): Promise<AdminResult<AdminHistoryRow[]>>;
}

/** Mounted only while the drawer is open, so every opening reads the newest changes. */
function HistoryBody({ load, formatKey, emptyTitle, emptyDescription, what, events }: { load: HistoryLoader; formatKey: (k: string) => string; emptyTitle: string; emptyDescription: string; what: string; events: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    void loadRef.current(LIMIT).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { status: "ok", rows: res.data } : { status: "error", message: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-soft">
        <Spinner /> Loading changes…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <ErrorState
        variant="inline"
        what={what}
        description={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (state.rows.length === 0) return <EmptyState variant="inline" title={emptyTitle} description={emptyDescription} />;
  return (
    <ol className="divide-y divide-v2-line/60">
      {state.rows.map((h) => (
        <li key={h.id} className="py-3 text-[13px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="break-all font-semibold text-ink">{formatKey(h.key)}</span>
            <time dateTime={h.changedAt} suppressHydrationWarning className="text-[12px] tabular-nums text-v2-muted">
              {new Date(h.changedAt).toLocaleString("en-US", WHEN)}
            </time>
          </div>
          {events ? (
            h.newValue ? <p className="mt-0.5 break-words text-ink-soft">{h.newValue}</p> : null
          ) : (
          <p className="mt-0.5 break-words text-ink-soft">
            <span className="text-v2-muted">{shortValue(h.oldValue)}</span> → <span className="font-medium text-ink">{shortValue(h.newValue)}</span>
          </p>
          )}
          <p className="mt-0.5 text-[12px] text-v2-muted">
            by {h.actorLogin ?? "system"}
            {h.reason ? ` · “${h.reason}”` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

export interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Reads the change history; the drawer calls it each time it opens (and on Retry). */
  load: HistoryLoader;
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** The DOM id of the drawer (default "admin-history-drawer"). */
  id?: string;
  title?: string;
  description?: string;
  formatKey?: (key: string) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** For the error line: "Couldn't load {what}". */
  what?: string;
  /** Rows are events (an action and its details), not value changes: no old-to-new line. */
  events?: boolean;
}

/** The change history of a group of settings (who, what, why), newest first: a drawer on a desktop, full screen on a phone. */
export default function HistoryDrawer({
  open,
  onClose,
  load,
  returnFocusTo,
  id = "admin-history-drawer",
  title = "Change history",
  description = "Who changed which setting, and why.",
  formatKey = dottedKey,
  emptyTitle = "No changes yet.",
  emptyDescription = "Every change shows up here with who made it and why.",
  what = "the change history",
  events = false,
}: HistoryDrawerProps) {
  const narrow = useNarrow();
  return (
    <SideSheet
      id={id}
      side="right"
      mode={narrow ? "fullscreen" : "overlay"}
      width={WIDTH}
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      returnFocusTo={returnFocusTo}
    >
      {open && <HistoryBody load={load} formatKey={formatKey} emptyTitle={emptyTitle} emptyDescription={emptyDescription} what={what} events={events} />}
    </SideSheet>
  );
}
